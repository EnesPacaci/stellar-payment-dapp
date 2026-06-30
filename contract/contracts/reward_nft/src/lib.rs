#![no_std]
#[cfg(test)]
extern crate std;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Vec};

#[derive(Clone)]
#[contracttype]
pub struct TokenMetadata {
    pub campaign: Address,
    pub milestone_id: u32,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    NextTokenId,
    TokenMetadata(u32),
    TokenOwner(u32),
    OwnerTokens(Address),
}

#[contract]
pub struct RewardNft;

#[contractimpl]
impl RewardNft {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextTokenId, &1_u32);

        env.events().publish((symbol_short!("init"),), (admin,));
    }

    pub fn mint(env: Env, admin: Address, to: Address, campaign: Address, milestone_id: u32, amount: i128) -> u32 {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "only admin can mint");

        let token_id: u32 = env.storage().instance().get(&DataKey::NextTokenId).unwrap();
        env.storage().instance().set(&DataKey::NextTokenId, &(token_id + 1));

        let metadata = TokenMetadata {
            campaign: campaign.clone(),
            milestone_id,
            amount,
            timestamp: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::TokenMetadata(token_id), &metadata);
        env.storage().persistent().set(&DataKey::TokenOwner(token_id), &to.clone());

        let mut tokens: Vec<u32> = env.storage().persistent().get(&DataKey::OwnerTokens(to.clone())).unwrap_or(Vec::new(&env));
        tokens.push_back(token_id);
        env.storage().persistent().set(&DataKey::OwnerTokens(to.clone()), &tokens);

        env.events().publish((symbol_short!("mint_nft"),), (to, token_id, milestone_id, amount));

        token_id
    }

    pub fn get_owner_tokens(env: Env, owner: Address) -> Vec<u32> {
        env.storage().persistent().get(&DataKey::OwnerTokens(owner)).unwrap_or(Vec::new(&env))
    }

    pub fn get_token_metadata(env: Env, token_id: u32) -> TokenMetadata {
        env.storage().persistent().get(&DataKey::TokenMetadata(token_id)).unwrap()
    }

    pub fn get_token_owner(env: Env, token_id: u32) -> Address {
        env.storage().persistent().get(&DataKey::TokenOwner(token_id)).unwrap()
    }

    pub fn total_supply(env: Env) -> u32 {
        let next_id: u32 = env.storage().instance().get(&DataKey::NextTokenId).unwrap_or(1);
        next_id - 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    fn setup() -> (Env, RewardNftClient<'static>) {
        let env = Env::default();
        env.ledger().set(LedgerInfo {
            timestamp: 1000,
            protocol_version: 26,
            sequence_number: 0,
            network_id: [0; 32],
            base_reserve: 0,
            min_temp_entry_ttl: 0,
            min_persistent_entry_ttl: 0,
            max_entry_ttl: 0,
        });
        let contract_id = env.register(RewardNft, ());
        let client = RewardNftClient::new(&env, &contract_id);
        (env, client)
    }

    #[test]
    fn test_init() {
        let (_env, client) = setup();
        let admin = Address::generate(&_env);
        _env.mock_all_auths();
        client.init(&admin);
        assert_eq!(client.total_supply(), 0);
    }

    #[test]
    fn test_mint() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let campaign = Address::generate(&env);

        env.mock_all_auths();
        client.init(&admin);

        let token_id = client.mint(&admin, &user, &campaign, &1, &500);
        assert_eq!(token_id, 1);

        let metadata = client.get_token_metadata(&token_id);
        assert_eq!(metadata.campaign, campaign);
        assert_eq!(metadata.milestone_id, 1);
        assert_eq!(metadata.amount, 500);
        assert_eq!(metadata.timestamp, 1000);

        assert_eq!(client.get_token_owner(&token_id), user);
        assert_eq!(client.total_supply(), 1);

        let user_tokens = client.get_owner_tokens(&user);
        assert_eq!(user_tokens.len(), 1);
        assert_eq!(user_tokens.get(0).unwrap(), 1);
    }

    #[test]
    fn test_multiple_mints() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let campaign = Address::generate(&env);

        env.mock_all_auths();
        client.init(&admin);

        client.mint(&admin, &user1, &campaign, &0, &300);
        client.mint(&admin, &user1, &campaign, &1, &700);
        client.mint(&admin, &user2, &campaign, &0, &300);

        assert_eq!(client.total_supply(), 3);
        assert_eq!(client.get_owner_tokens(&user1).len(), 2);
        assert_eq!(client.get_owner_tokens(&user2).len(), 1);
    }

    #[test]
    fn test_non_admin_cannot_mint() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);
        let user = Address::generate(&env);
        let campaign = Address::generate(&env);

        env.mock_all_auths();
        client.init(&admin);

        let result = client.try_mint(&attacker, &user, &campaign, &0, &500);
        assert!(result.is_err());
    }

    #[test]
    fn test_token_id_increments() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let campaign = Address::generate(&env);

        env.mock_all_auths();
        client.init(&admin);

        for i in 1..=5 {
            let tid = client.mint(&admin, &user, &campaign, &i, &((i as i128) * 100));
            assert_eq!(tid, i as u32);
        }
        assert_eq!(client.total_supply(), 5);
    }
}
