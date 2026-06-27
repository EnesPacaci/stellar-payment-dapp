#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Env, Address};
use crate::{CrowdfundContract, CrowdfundContractClient};

fn create_contract<'a>(env: &Env, admin: &Address, goal: i128) -> CrowdfundContractClient<'a> {
    let contract = CrowdfundContractClient::new(env, &env.register_contract(None, CrowdfundContract));
    contract.initialize(admin, &goal);
    contract
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract = create_contract(&env, &admin, 10_000);

    assert_eq!(contract.get_goal(), 10_000);
    assert_eq!(contract.get_total_raised(), 0);
}

#[test]
fn test_donate() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let contract = create_contract(&env, &admin, 10_000);

    env.mock_all_auths();
    contract.donate(&donor, &100);

    assert_eq!(contract.get_total_raised(), 100);
}

#[test]
fn test_multiple_donations() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let donor1 = Address::generate(&env);
    let donor2 = Address::generate(&env);
    let contract = create_contract(&env, &admin, 10_000);

    env.mock_all_auths();
    contract.donate(&donor1, &500);
    contract.donate(&donor2, &250);

    assert_eq!(contract.get_total_raised(), 750);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_donate_zero() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let contract = create_contract(&env, &admin, 10_000);

    env.mock_all_auths();
    contract.donate(&donor, &0);
}
