#![no_std]
#[cfg(test)]
extern crate std;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, String, TryFromVal, Val, Vec};

#[derive(Clone, PartialEq)]
#[contracttype]
pub enum MilestoneStatus {
    Pending,
    Completed,
    Approved,
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
            let status_val = u32::try_from_val(&env, &raw.get(2).unwrap()).unwrap();
            let status = match status_val {
                0 => MilestoneStatus::Pending,
                1 => MilestoneStatus::Completed,
                2 => MilestoneStatus::Approved,
                _ => MilestoneStatus::Pending,
            };
            milestone_total += amount;
            milestones.push_back(Milestone { amount, description, status });
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

        env.events().publish(
            (symbol_short!("created"),),
            (admin, goal, deadline),
        );
    }

    pub fn donate(env: Env, donor: Address, amount: i128) {
        donor.require_auth();
        assert!(amount > 0, "amount must be positive");

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalRaised, &(total + amount));

        env.events()
            .publish((symbol_short!("donate"),), (donor, amount));
    }

    pub fn submit_milestone(env: Env, admin: Address, index: u32) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap();
        assert!(admin == stored_admin, "only admin can submit");

        let mut milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap();
        let mut m = milestones.get(index).unwrap();
        assert!(m.status == MilestoneStatus::Pending, "milestone not pending");

        m.status = MilestoneStatus::Completed;
        let ms_amount = m.amount;
        milestones.set(index, m);
        env.storage()
            .instance()
            .set(&DataKey::Milestones, &milestones);

        env.events()
            .publish((symbol_short!("ms_submit"),), (index, ms_amount));
    }

    pub fn approve_milestone(env: Env, admin: Address, index: u32) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap();
        assert!(admin == stored_admin, "only admin can approve");

        let mut milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap();
        let mut m = milestones.get(index).unwrap();
        assert!(m.status == MilestoneStatus::Completed, "milestone not completed");

        let raised: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0);
        let released: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalReleased)
            .unwrap_or(0);
        assert!(raised >= released + m.amount, "insufficient funds");

        m.status = MilestoneStatus::Approved;
        let ms_amount = m.amount;
        milestones.set(index, m);
        env.storage()
            .instance()
            .set(&DataKey::Milestones, &milestones);
        env.storage()
            .instance()
            .set(&DataKey::TotalReleased, &(released + ms_amount));

        env.events()
            .publish((symbol_short!("ms_appr"),), (index, ms_amount));
    }

    pub fn get_milestones(env: Env) -> Vec<Milestone> {
        env.storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_info(env: Env) -> (i128, i128, u64) {
        let goal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Goal)
            .unwrap_or(0);
        let raised: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0);
        let deadline: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Deadline)
            .unwrap_or(0);
        (goal, raised, deadline)
    }

    pub fn get_total_raised(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0)
    }

    pub fn get_total_released(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalReleased)
            .unwrap_or(0)
    }

    pub fn get_goal(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Goal)
            .unwrap_or(0)
    }

    pub fn get_name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or(String::from_str(&env, ""))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, CampaignClient<'static>) {
        let env = Env::default();
        let contract_id = env.register(Campaign, ());
        let client = CampaignClient::new(&env, &contract_id);
        (env, client)
    }

    fn default_milestones(env: &Env) -> Vec<Vec<Val>> {
        let mut milestones = Vec::new(env);

        let mut ms1 = Vec::new(env);
        ms1.push_back(300_i128.into_val(env));
        ms1.push_back(String::from_str(env, "Phase 1").into_val(env));
        ms1.push_back(0_u32.into_val(env));
        milestones.push_back(ms1);

        let mut ms2 = Vec::new(env);
        ms2.push_back(700_i128.into_val(env));
        ms2.push_back(String::from_str(env, "Phase 2").into_val(env));
        ms2.push_back(0_u32.into_val(env));
        milestones.push_back(ms2);

        milestones
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
            &1000,
            &1000000,
            &milestones,
        );

        assert_eq!(client.get_goal(), 1000);
        assert_eq!(client.get_total_raised(), 0);
        assert_eq!(client.get_total_released(), 0);
        assert_eq!(client.get_milestones().len(), 2);
    }

    #[test]
    fn test_donate() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let donor = Address::generate(&env);
        let milestones = default_milestones(&env);

        client.init(&admin, &factory, &String::from_str(&env, "Test"), &1000, &1000000, &milestones);

        env.mock_all_auths();
        client.donate(&donor, &500);
        assert_eq!(client.get_total_raised(), 500);
    }

    #[test]
    fn test_submit_and_approve_milestone() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let donor = Address::generate(&env);
        let milestones = default_milestones(&env);

        client.init(&admin, &factory, &String::from_str(&env, "Test"), &1000, &1000000, &milestones);

        env.mock_all_auths();
        client.donate(&donor, &500);

        client.submit_milestone(&admin, &0);
        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Completed));

        client.approve_milestone(&admin, &0);
        let ms = client.get_milestones();
        assert!(matches!(ms.get(0).unwrap().status, MilestoneStatus::Approved));
        assert_eq!(client.get_total_released(), 300);
    }

    #[test]
    fn test_approve_without_enough_funds_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let donor = Address::generate(&env);
        let milestones = default_milestones(&env);

        client.init(&admin, &factory, &String::from_str(&env, "Test"), &1000, &1000000, &milestones);

        env.mock_all_auths();
        client.donate(&donor, &100);

        client.submit_milestone(&admin, &0);
        let result = client.try_approve_milestone(&admin, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_admin_cannot_submit() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let someone = Address::generate(&env);
        let milestones = default_milestones(&env);

        client.init(&admin, &factory, &String::from_str(&env, "Test"), &1000, &1000000, &milestones);

        env.mock_all_auths();
        let result = client.try_submit_milestone(&someone, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_donate_zero_fails() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let donor = Address::generate(&env);
        let milestones = default_milestones(&env);

        client.init(&admin, &factory, &String::from_str(&env, "Test"), &1000, &1000000, &milestones);

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
        ms1.push_back(500_i128.into_val(&env));
        ms1.push_back(String::from_str(&env, "Phase 1").into_val(&env));
        ms1.push_back(0_u32.into_val(&env));
        milestones.push_back(ms1);

        env.mock_all_auths();
        let result = client.try_init(
            &admin,
            &factory,
            &String::from_str(&env, "Test"),
            &1000,
            &1000000,
            &milestones,
        );
        assert!(result.is_err());
    }
}
