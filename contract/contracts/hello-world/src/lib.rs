#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, Address};

#[contracttype]
pub enum DataKey {
    Admin,
    Goal,
    TotalRaised,
}

#[contract]
pub struct CrowdfundContract;

#[contractimpl]
impl CrowdfundContract {
    pub fn initialize(env: Env, admin: Address, goal: i128) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Goal, &goal);
        env.storage().instance().set(&DataKey::TotalRaised, &0_i128);
    }

    pub fn donate(env: Env, donor: Address, amount: i128) {
        donor.require_auth();
        assert!(amount > 0, "amount must be positive");

        let current_total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0);

        let new_total = current_total + amount;
        env.storage().instance().set(&DataKey::TotalRaised, &new_total);

        env.events().publish(
            (symbol_short!("donate"),),
            (donor, amount),
        );
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
