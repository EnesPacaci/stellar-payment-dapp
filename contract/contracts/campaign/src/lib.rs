#![no_std]
#[cfg(test)]
extern crate std;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, TryFromVal, Val, Vec, IntoVal};

const VOTING_PERIOD: u64 = 7 * 24 * 60 * 60;
const MIN_DONATION: i128 = 10_000_000; // 1 XLM minimum

#[derive(Clone, PartialEq)]
#[contracttype]
pub enum MilestoneStatus {
    Pending,
    Submitted,
    Approved,
    Rejected,
}

#[derive(Clone)]
#[contracttype]
pub struct Milestone {
    pub amount: i128,
    pub description: String,
    pub status: MilestoneStatus,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Factory,
    Name,
    Goal,
    Deadline,
    TotalRaised,
    TotalReleased,
    Milestones,
    TotalVoterWeight,
    TotalDonorCount,
    DonorTotal(Address),
    VoteApprovals(u32),
    VoteRejections(u32),
    ApprovedVoters(u32),
    VotedStatus(u32, Address),
    VotedDonorCount(u32),
    VotingDeadline(u32),
    RefundClaimed(u32, Address),
    NftContract,
}

#[contract]
pub struct Campaign;

#[contractimpl]
impl Campaign {
    pub fn init(
        env: Env,
        admin: Address,
        factory: Address,
        name: String,
        goal: i128,
        deadline: u64,
        raw_milestones: Vec<Vec<Val>>,
    ) {
        assert!(raw_milestones.len() > 0, "must have at least one milestone");

        let mut milestones: Vec<Milestone> = Vec::new(&env);
        let mut milestone_total: i128 = 0;
        for raw in raw_milestones.iter() {
            let amount = i128::try_from_val(&env, &raw.get(0).unwrap()).unwrap();
            let description = String::try_from_val(&env, &raw.get(1).unwrap()).unwrap();
            let _status_val = u32::try_from_val(&env, &raw.get(2).unwrap()).unwrap();
            milestone_total += amount;
            milestones.push_back(Milestone { amount, description, status: MilestoneStatus::Pending });
        }
        assert!(milestone_total == goal, "milestone amounts must sum to goal");

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Goal, &goal);
        env.storage().instance().set(&DataKey::Deadline, &deadline);
        env.storage().instance().set(&DataKey::TotalRaised, &0_i128);
        env.storage().instance().set(&DataKey::TotalReleased, &0_i128);
        env.storage().instance().set(&DataKey::Milestones, &milestones);
        env.storage().instance().set(&DataKey::TotalVoterWeight, &0_i128);
        env.storage().instance().set(&DataKey::TotalDonorCount, &0_i128);

        env.events().publish(
            (symbol_short!("created"),),
            (admin, goal, deadline),
        );
    }

    pub fn donate(env: Env, donor: Address, amount: i128) {
        donor.require_auth();
        assert!(amount >= MIN_DONATION, "minimum donation is 1 XLM");

        let total: i128 = env.storage().instance().get(&DataKey::TotalRaised).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalRaised, &(total + amount));

        let donor_total: i128 = env.storage().persistent().get(&DataKey::DonorTotal(donor.clone())).unwrap_or(0);

        if donor_total == 0 {
            let donor_count: i128 = env.storage().instance().get(&DataKey::TotalDonorCount).unwrap_or(0);
            env.storage().instance().set(&DataKey::TotalDonorCount, &(donor_count + 1));
        }

        env.storage().persistent().set(&DataKey::DonorTotal(donor.clone()), &(donor_total + amount));

        let voter_weight: i128 = env.storage().instance().get(&DataKey::TotalVoterWeight).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalVoterWeight, &(voter_weight + amount));

        env.events().publish((symbol_short!("donate"),), (donor, amount));
    }

    pub fn submit_milestone(env: Env, admin: Address, index: u32) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "only admin can submit");

        let mut milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).unwrap();
        let mut m = milestones.get(index).unwrap();
        assert!(m.status == MilestoneStatus::Pending, "milestone not pending");
        assert!(
            env.ledger().timestamp() <= env.storage().instance().get(&DataKey::Deadline).unwrap_or(0),
            "campaign deadline has passed"
        );

        m.status = MilestoneStatus::Submitted;
        let ms_amount = m.amount;
        milestones.set(index, m);
        env.storage().instance().set(&DataKey::Milestones, &milestones);

        let deadline = env.ledger().timestamp() + VOTING_PERIOD;
        env.storage().persistent().set(&DataKey::VotingDeadline(index), &deadline);

        env.events().publish((symbol_short!("ms_submit"),), (index, ms_amount, deadline));
    }

    pub fn vote_approve(env: Env, donor: Address, index: u32) {
        donor.require_auth();
        _cast_vote(&env, donor, index, true);
    }

    pub fn vote_reject(env: Env, donor: Address, index: u32) {
        donor.require_auth();
        _cast_vote(&env, donor, index, false);
    }

    pub fn set_nft(env: Env, nft_contract: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::NftContract, &nft_contract);
    }

    pub fn get_nft_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::NftContract)
    }

    pub fn release_milestone(env: Env, index: u32) {
        let mut milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).unwrap();
        let mut m = milestones.get(index).unwrap();
        assert!(m.status == MilestoneStatus::Submitted, "milestone not submitted");

        let approvals: i128 = env.storage().persistent().get(&DataKey::VoteApprovals(index)).unwrap_or(0);
        let rejections: i128 = env.storage().persistent().get(&DataKey::VoteRejections(index)).unwrap_or(0);
        let total_voted = approvals + rejections;
        let voting_deadline: u64 = env.storage().persistent().get(&DataKey::VotingDeadline(index)).unwrap();
        let now = env.ledger().timestamp();

        let donor_count: i128 = env.storage().instance().get(&DataKey::TotalDonorCount).unwrap_or(0);
        let voted_count: i128 = env.storage().persistent().get(&DataKey::VotedDonorCount(index)).unwrap_or(0);

        let quorum_met = donor_count >= 2 && voted_count * 100 > donor_count * 50;

        if quorum_met {
            let supermajority_met = total_voted > 0 && approvals * 100 >= total_voted * 66;

            if supermajority_met {
                m.status = MilestoneStatus::Approved;
                let ms_amount = m.amount;
                milestones.set(index, m);
                env.storage().instance().set(&DataKey::Milestones, &milestones);

                let released: i128 = env.storage().instance().get(&DataKey::TotalReleased).unwrap_or(0);
                let raised: i128 = env.storage().instance().get(&DataKey::TotalRaised).unwrap_or(0);
                assert!(raised >= released + ms_amount, "insufficient funds");
                env.storage().instance().set(&DataKey::TotalReleased, &(released + ms_amount));

                // Auto-mint NFTs for approved voters
                let nft_contract: Option<Address> = env.storage().instance().get(&DataKey::NftContract);
                if let Some(nft_addr) = nft_contract {
                    let approved_voters: Vec<Address> = env.storage().persistent().get(&DataKey::ApprovedVoters(index)).unwrap_or(Vec::new(&env));
                    if approved_voters.len() > 0 {
                        let mut amounts = Vec::new(&env);
                        let mut i = 0u32;
                        while i < approved_voters.len() {
                            let voter = approved_voters.get(i).unwrap();
                            let donor_total: i128 = env.storage().persistent().get(&DataKey::DonorTotal(voter)).unwrap_or(0);
                            amounts.push_back(donor_total);
                            i += 1;
                        }
                        let campaign_addr = env.current_contract_address();
                        let mut args: Vec<Val> = Vec::new(&env);
                        args.push_back(env.current_contract_address().into_val(&env));
                        args.push_back(approved_voters.into_val(&env));
                        args.push_back(campaign_addr.into_val(&env));
                        args.push_back(index.into_val(&env));
                        args.push_back(amounts.into_val(&env));
                        let _: Val = env.invoke_contract::<Val>(
                            &nft_addr,
                            &symbol_short!("bmint"),
                            args,
                        );
                    }
                }

                env.events().publish((symbol_short!("ms_appr"),), (index, ms_amount));
            } else if now > voting_deadline {
                m.status = MilestoneStatus::Rejected;
                milestones.set(index, m);
                env.storage().instance().set(&DataKey::Milestones, &milestones);

                env.events().publish((symbol_short!("ms_rej"),), (index,));
            } else {
                panic!("voting still open: quorum met but supermajority not yet achieved");
            }
        } else if now > voting_deadline {
            m.status = MilestoneStatus::Rejected;
            milestones.set(index, m);
            env.storage().instance().set(&DataKey::Milestones, &milestones);

            env.events().publish((symbol_short!("ms_rej"),), (index,));
        } else {
            panic!("voting still open: quorum not yet met");
        }
    }

    pub fn claim_refund(env: Env, donor: Address, index: u32) {
        donor.require_auth();

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).unwrap();
        let m = milestones.get(index).unwrap();
        assert!(m.status == MilestoneStatus::Rejected, "milestone not rejected");

        let claimed: bool = env.storage().persistent().get(&DataKey::RefundClaimed(index, donor.clone())).unwrap_or(false);
        assert!(!claimed, "refund already claimed for this milestone");

        let donor_total: i128 = env.storage().persistent().get(&DataKey::DonorTotal(donor.clone())).unwrap_or(0);
        assert!(donor_total > 0, "no donation to refund");

        let total_voter_weight: i128 = env.storage().instance().get(&DataKey::TotalVoterWeight).unwrap_or(1);
        let refund_amount = (donor_total * m.amount) / total_voter_weight;
        assert!(refund_amount > 0, "refund amount is zero");

        env.storage().persistent().set(&DataKey::RefundClaimed(index, donor.clone()), &true);

        env.events().publish((symbol_short!("refund"),), (donor, index, refund_amount));
    }

    pub fn get_milestones(env: Env) -> Vec<Milestone> {
        env.storage().instance().get(&DataKey::Milestones).unwrap_or(Vec::new(&env))
    }

    pub fn get_info(env: Env) -> (i128, i128, u64) {
        let goal: i128 = env.storage().instance().get(&DataKey::Goal).unwrap_or(0);
        let raised: i128 = env.storage().instance().get(&DataKey::TotalRaised).unwrap_or(0);
        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap_or(0);
        (goal, raised, deadline)
    }

    pub fn get_total_raised(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalRaised).unwrap_or(0)
    }

    pub fn get_total_released(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalReleased).unwrap_or(0)
    }

    pub fn get_goal(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Goal).unwrap_or(0)
    }

    pub fn get_name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap_or(String::from_str(&env, ""))
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn get_vote_status(env: Env, index: u32) -> (i128, i128, u64) {
        let approvals: i128 = env.storage().persistent().get(&DataKey::VoteApprovals(index)).unwrap_or(0);
        let rejections: i128 = env.storage().persistent().get(&DataKey::VoteRejections(index)).unwrap_or(0);
        let deadline: u64 = env.storage().persistent().get(&DataKey::VotingDeadline(index)).unwrap_or(0);
        (approvals, rejections, deadline)
    }

    pub fn get_donor_total(env: Env, donor: Address) -> i128 {
        env.storage().persistent().get(&DataKey::DonorTotal(donor)).unwrap_or(0)
    }

    pub fn get_total_voter_weight(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalVoterWeight).unwrap_or(0)
    }

    pub fn get_total_donor_count(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalDonorCount).unwrap_or(0)
    }

    pub fn get_voted_donor_count(env: Env, index: u32) -> i128 {
        env.storage().persistent().get(&DataKey::VotedDonorCount(index)).unwrap_or(0)
    }

    pub fn get_approved_voters(env: Env, index: u32) -> Vec<Address> {
        env.storage().persistent().get(&DataKey::ApprovedVoters(index)).unwrap_or(Vec::new(&env))
    }

    pub fn get_has_voted(env: Env, donor: Address, index: u32) -> bool {
        env.storage().persistent().get(&DataKey::VotedStatus(index, donor)).unwrap_or(false)
    }

    pub fn get_refund_claimed(env: Env, donor: Address, index: u32) -> bool {
        env.storage().persistent().get(&DataKey::RefundClaimed(index, donor)).unwrap_or(false)
    }
}

fn _cast_vote(env: &Env, donor: Address, index: u32, approve: bool) {
    let donor_total: i128 = env.storage().persistent().get(&DataKey::DonorTotal(donor.clone())).unwrap_or(0);
    assert!(donor_total > 0, "only donors can vote");

    let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).unwrap();
    let m = milestones.get(index).unwrap();
    assert!(m.status == MilestoneStatus::Submitted, "milestone not submitted for voting");

    let voted: bool = env.storage().persistent().get(&DataKey::VotedStatus(index, donor.clone())).unwrap_or(false);
    assert!(!voted, "already voted on this milestone");

    let voting_deadline: u64 = env.storage().persistent().get(&DataKey::VotingDeadline(index)).unwrap();
    let now = env.ledger().timestamp();
    assert!(now <= voting_deadline, "voting period has ended");

    env.storage().persistent().set(&DataKey::VotedStatus(index, donor.clone()), &true);

    let voted_count: i128 = env.storage().persistent().get(&DataKey::VotedDonorCount(index)).unwrap_or(0);
    env.storage().persistent().set(&DataKey::VotedDonorCount(index), &(voted_count + 1));

    if approve {
        let approvals: i128 = env.storage().persistent().get(&DataKey::VoteApprovals(index)).unwrap_or(0);
        env.storage().persistent().set(&DataKey::VoteApprovals(index), &(approvals + donor_total));
        
        // Store approve voter
        let mut approved_voters: Vec<Address> = env.storage().persistent().get(&DataKey::ApprovedVoters(index)).unwrap_or(Vec::new(&env));
        if !approved_voters.contains(&donor) {
            approved_voters.push_back(donor.clone());
            env.storage().persistent().set(&DataKey::ApprovedVoters(index), &approved_voters);
        }
        
        env.events().publish((symbol_short!("vote_a"),), (donor, index));
    } else {
        let rejections: i128 = env.storage().persistent().get(&DataKey::VoteRejections(index)).unwrap_or(0);
        env.storage().persistent().set(&DataKey::VoteRejections(index), &(rejections + donor_total));
        env.events().publish((symbol_short!("vote_r"),), (donor, index));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger, LedgerInfo}, IntoVal};

    fn setup() -> (Env, CampaignClient<'static>) {
        let env = Env::default();
        let contract_id = env.register(Campaign, ());
        let client = CampaignClient::new(&env, &contract_id);
        (env, client)
    }

    fn default_milestones(env: &Env) -> Vec<Vec<Val>> {
        let mut milestones = Vec::new(env);

        let mut ms1 = Vec::new(env);
        ms1.push_back(300_000_000_i128.into_val(env));
        ms1.push_back(String::from_str(env, "Phase 1").into_val(env));
        ms1.push_back(0_u32.into_val(env));
        milestones.push_back(ms1);

        let mut ms2 = Vec::new(env);
        ms2.push_back(700_000_000_i128.into_val(env));
        ms2.push_back(String::from_str(env, "Phase 2").into_val(env));
        ms2.push_back(0_u32.into_val(env));
        milestones.push_back(ms2);

        milestones
    }

    fn init_campaign(env: &Env, client: &CampaignClient<'static>, admin: &Address) {
        let factory = Address::generate(env);
        client.init(admin, &factory, &String::from_str(env, "Test Campaign"), &1_000_000_000, &1000000, &default_milestones(env));
    }

    fn set_timestamp(env: &Env, ts: u64) {
        env.ledger().set(LedgerInfo {
            timestamp: ts,
            protocol_version: 26,
            sequence_number: 0,
            network_id: [0; 32],
            base_reserve: 0,
            min_temp_entry_ttl: 0,
            min_persistent_entry_ttl: 0,
            max_entry_ttl: 0,
        });
    }

    #[test]
    fn test_initialize_with_milestones() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let milestones = default_milestones(&env);

        client.init(
            &admin,
            &factory,
            &String::from_str(&env, "Test Campaign"),
            &1_000_000_000,
            &1000000,
            &milestones,
        );

        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_goal(), 1_000_000_000);
        assert_eq!(client.get_total_raised(), 0);
        assert_eq!(client.get_total_released(), 0);
        assert_eq!(client.get_total_voter_weight(), 0);
        assert_eq!(client.get_total_donor_count(), 0);
        assert_eq!(client.get_milestones().len(), 2);
    }

    #[test]
    fn test_donate() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &500_000_000);

        assert_eq!(client.get_total_raised(), 500_000_000);
        assert_eq!(client.get_donor_total(&donor), 500_000_000);
        assert_eq!(client.get_total_voter_weight(), 500_000_000);
        assert_eq!(client.get_total_donor_count(), 1);
    }

    #[test]
    fn test_donate_below_minimum_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        let result = client.try_donate(&donor, &5_000_000);
        assert!(result.is_err());
    }

    #[test]
    fn test_submit_milestone() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &500_000_000);
        client.submit_milestone(&admin, &0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Submitted));
    }

    #[test]
    fn test_full_vote_approve_flow() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &600_000_000);
        client.donate(&donor2, &400_000_000);

        client.submit_milestone(&admin, &0);

        client.vote_approve(&donor1, &0);
        client.vote_approve(&donor2, &0);

        let (approvals, rejections, deadline) = client.get_vote_status(&0);
        assert_eq!(approvals, 1_000_000_000);
        assert_eq!(rejections, 0);
        assert!(deadline > 1000);

        client.release_milestone(&0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Approved));
        assert_eq!(client.get_total_released(), 300_000_000);
    }

    #[test]
    fn test_vote_reject_after_deadline() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &600_000_000);
        client.donate(&donor2, &400_000_000);
        client.submit_milestone(&admin, &0);

        client.vote_reject(&donor1, &0);
        client.vote_reject(&donor2, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        client.release_milestone(&0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Rejected));
        assert_eq!(client.get_total_released(), 0);
    }

    #[test]
    fn test_single_donor_cannot_release_alone() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &1_000_000_000);
        client.submit_milestone(&admin, &0);

        client.vote_approve(&donor, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        client.release_milestone(&0);

        let ms = client.get_milestones();
        // Only 1 donor, quorum requires >= 2 donors, so rejected
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Rejected));
    }

    #[test]
    fn test_two_donors_one_votes_quorum_not_met() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &600_000_000);
        client.donate(&donor2, &400_000_000);
        client.submit_milestone(&admin, &0);

        // Only 1 of 2 donors voted = 50%, need > 50%
        client.vote_approve(&donor1, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        client.release_milestone(&0);

        let ms = client.get_milestones();
        // 50% is not > 50%, quorum not met -> rejected
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Rejected));
    }

    #[test]
    fn test_two_donors_both_vote_quorum_met() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &600_000_000);
        client.donate(&donor2, &400_000_000);
        client.submit_milestone(&admin, &0);

        // Both vote = 100% quorum, both approve = 100% supermajority
        client.vote_approve(&donor1, &0);
        client.vote_approve(&donor2, &0);

        client.release_milestone(&0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Approved));
    }

    #[test]
    fn test_three_donors_two_vote_quorum_met() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        let donor3 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &500_000_000);
        client.donate(&donor2, &300_000_000);
        client.donate(&donor3, &200_000_000);
        client.submit_milestone(&admin, &0);

        // 2 of 3 voted = 66% >= 50% quorum
        // 2 approve, 0 reject = 100% >= 66% supermajority
        client.vote_approve(&donor1, &0);
        client.vote_approve(&donor2, &0);

        client.release_milestone(&0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Approved));
    }

    #[test]
    fn test_three_donors_two_vote_supermajority_not_met() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        let donor3 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &500_000_000);
        client.donate(&donor2, &300_000_000);
        client.donate(&donor3, &200_000_000);
        client.submit_milestone(&admin, &0);

        // 2 of 3 voted = 66% >= 50% quorum
        // 1 approve (500), 1 reject (300) = 62.5% approve < 66% supermajority
        client.vote_approve(&donor1, &0);
        client.vote_reject(&donor2, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        client.release_milestone(&0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Rejected));
    }

    #[test]
    fn test_non_donor_cannot_vote() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let non_donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &500_000_000);
        client.submit_milestone(&admin, &0);

        let result = client.try_vote_approve(&non_donor, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_voting_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &500_000_000);
        client.submit_milestone(&admin, &0);

        client.vote_approve(&donor, &0);
        let result = client.try_vote_approve(&donor, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_vote_after_deadline_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &500_000_000);
        client.submit_milestone(&admin, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        let result = client.try_vote_approve(&donor, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_claim_refund_after_rejection() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &600_000_000);
        client.donate(&donor2, &400_000_000);
        client.submit_milestone(&admin, &0);

        client.vote_reject(&donor1, &0);
        client.vote_reject(&donor2, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        client.release_milestone(&0);

        client.claim_refund(&donor1, &0);
        assert!(client.get_refund_claimed(&donor1, &0));

        client.claim_refund(&donor2, &0);
        assert!(client.get_refund_claimed(&donor2, &0));
    }

    #[test]
    fn test_double_claim_refund_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &1_000_000_000);
        client.submit_milestone(&admin, &0);
        client.vote_reject(&donor, &0);

        set_timestamp(&env, 1000 + VOTING_PERIOD + 1);
        client.release_milestone(&0);

        client.claim_refund(&donor, &0);
        let result = client.try_claim_refund(&donor, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_admin_cannot_submit() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let someone = Address::generate(&env);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        let result = client.try_submit_milestone(&someone, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_donate_zero_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        let result = client.try_donate(&donor, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_milestone_sum_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let mut milestones = Vec::new(&env);
        let mut ms1 = Vec::new(&env);
        ms1.push_back(500_000_000_i128.into_val(&env));
        ms1.push_back(String::from_str(&env, "Phase 1").into_val(&env));
        ms1.push_back(0_u32.into_val(&env));
        milestones.push_back(ms1);

        env.mock_all_auths();
        let result = client.try_init(
            &admin,
            &factory,
            &String::from_str(&env, "Test"),
            &1_000_000_000,
            &1000000,
            &milestones,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_multiple_donors_diff_weights() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let big = Address::generate(&env);
        let small = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&big, &900_000_000);
        client.donate(&small, &100_000_000);
        client.submit_milestone(&admin, &0);

        // 2 of 2 voted = 100% quorum
        // big approves (900), small rejects (100) = 90% approve >= 66% supermajority
        client.vote_approve(&big, &0);
        client.vote_reject(&small, &0);

        client.release_milestone(&0);

        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Approved));
        assert_eq!(client.get_total_released(), 300_000_000);
    }

    #[test]
    fn test_release_before_any_votes_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        set_timestamp(&env, 1000);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor, &500_000_000);
        client.submit_milestone(&admin, &0);

        let result = client.try_release_milestone(&0);
        assert!(result.is_err());
    }

    #[test]
    fn test_donation_count_tracking() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let donor1 = Address::generate(&env);
        let donor2 = Address::generate(&env);
        init_campaign(&env, &client, &admin);

        env.mock_all_auths();
        client.donate(&donor1, &500_000_000);
        assert_eq!(client.get_total_donor_count(), 1);

        client.donate(&donor2, &300_000_000);
        assert_eq!(client.get_total_donor_count(), 2);

        // Same donor donates again, count should not increase
        client.donate(&donor1, &200_000_000);
        assert_eq!(client.get_total_donor_count(), 2);
    }
}
