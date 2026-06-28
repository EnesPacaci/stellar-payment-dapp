#![no_std]
#[cfg(test)]
extern crate std;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};

#[derive(Clone)]
#[contracttype]
pub struct Milestone {
    pub amount: i128,
    pub description: String,
    pub completed: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Factory,
    Goal,
    Deadline,
    TotalRaised,
}

#[contract]
pub struct Campaign;

#[contractimpl]
impl Campaign {
    pub fn init(env: Env, admin: Address, factory: Address, goal: i128, deadline: u64) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::Goal, &goal);
        env.storage().instance().set(&DataKey::Deadline, &deadline);
        env.storage().instance().set(&DataKey::TotalRaised, &0_i128);

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

    pub fn get_goal(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Goal)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register(Campaign, ());
        let client = CampaignClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let goal: i128 = 1000;
        let deadline: u64 = 1000000;

        client.init(&admin, &factory, &goal, &deadline);

        assert_eq!(client.get_goal(), goal);
        assert_eq!(client.get_total_raised(), 0);

        let (g, r, d) = client.get_info();
        assert_eq!(g, goal);
        assert_eq!(r, 0);
        assert_eq!(d, deadline);
    }

    #[test]
    fn test_donate() {
        let env = Env::default();
        let contract_id = env.register(Campaign, ());
        let client = CampaignClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let donor = Address::generate(&env);

        client.init(&admin, &factory, &500, &1000000);

        env.mock_all_auths();
        client.donate(&donor, &250);
        assert_eq!(client.get_total_raised(), 250);

        client.donate(&donor, &100);
        assert_eq!(client.get_total_raised(), 350);
    }

    #[test]
    fn test_donate_zero_fails() {
        let env = Env::default();
        let contract_id = env.register(Campaign, ());
        let client = CampaignClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        let donor = Address::generate(&env);

        client.init(&admin, &factory, &500, &1000000);

        env.mock_all_auths();
        let result = client.try_donate(&donor, &0);
        assert!(result.is_err());
    }
}
