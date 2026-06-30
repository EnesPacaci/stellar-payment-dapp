#![no_std]
#[cfg(test)]
extern crate std;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, IntoVal, String, Vec};

#[derive(Clone)]
#[contracttype]
pub struct Milestone {
    pub amount: i128,
    pub description: String,
    pub status: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    CampaignWasm,
    CampaignList,
    Nonce,
    NftContract,
}

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    pub fn initialize(env: Env, admin: Address, campaign_wasm: BytesN<32>) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CampaignWasm, &campaign_wasm);
        env.storage()
            .instance()
            .set(&DataKey::CampaignList, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::Nonce, &0_u32);
    }

    pub fn create_campaign(env: Env, creator: Address, name: soroban_sdk::String, goal: i128, deadline: u64, milestones: Vec<Vec<soroban_sdk::Val>>) -> Address {
        creator.require_auth();

        let wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::CampaignWasm)
            .unwrap();

        let nonce: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Nonce)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Nonce, &(nonce + 1));

        let salt = Bytes::from_array(&env, &nonce.to_be_bytes());
        let hash = env.crypto().sha256(&salt);
        let deployer = env.deployer().with_current_contract(hash);
        let campaign_addr = deployer.deploy_v2(wasm, ());

        let mut args: Vec<soroban_sdk::Val> = Vec::new(&env);
        args.push_back(creator.into_val(&env));
        args.push_back(env.current_contract_address().into_val(&env));
        args.push_back(name.into_val(&env));
        args.push_back(goal.into_val(&env));
        args.push_back(deadline.into_val(&env));
        args.push_back(milestones.into_val(&env));

        env.invoke_contract::<soroban_sdk::Val>(
            &campaign_addr,
            &symbol_short!("init"),
            args,
        );

        // Auto-set NFT contract on the campaign
        let nft_contract: Option<Address> = env.storage().instance().get(&DataKey::NftContract);
        if let Some(nft_addr) = nft_contract {
            let mut nft_args: Vec<soroban_sdk::Val> = Vec::new(&env);
            nft_args.push_back(nft_addr.into_val(&env));
            let _ = env.invoke_contract::<soroban_sdk::Val>(
                &campaign_addr,
                &symbol_short!("set_nft"),
                nft_args,
            );
        }

        let mut list: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::CampaignList)
            .unwrap();
        list.push_back(campaign_addr.clone());
        env.storage()
            .instance()
            .set(&DataKey::CampaignList, &list);

        env.events()
            .publish((symbol_short!("campaign"),), (&campaign_addr, goal));

        campaign_addr
    }

    pub fn get_campaigns(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::CampaignList)
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_campaign_count(env: Env) -> u32 {
        let list: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::CampaignList)
            .unwrap_or(Vec::new(&env));
        list.len()
    }

    pub fn set_nft_contract(env: Env, nft_contract: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::NftContract, &nft_contract);
    }

    pub fn get_nft_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::NftContract)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn default_milestones(env: &Env, amounts: &[i128]) -> Vec<Vec<soroban_sdk::Val>> {
        let mut milestones = Vec::new(env);
        for (i, amount) in amounts.iter().enumerate() {
            let desc = match i {
                0 => "Phase 1",
                1 => "Phase 2",
                _ => "Phase N",
            };
            let mut ms = Vec::new(env);
            ms.push_back((*amount).into_val(env));
            ms.push_back(String::from_str(env, desc).into_val(env));
            ms.push_back(0_u32.into_val(env));
            milestones.push_back(ms);
        }
        milestones
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register(Factory, ());
        let client = FactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fake_wasm = BytesN::from_array(&env, &[0u8; 32]);

        env.mock_all_auths();
        client.initialize(&admin, &fake_wasm);
        assert_eq!(client.get_campaign_count(), 0);
        assert_eq!(client.get_campaigns().len(), 0);
    }

    #[test]
    fn test_create_campaign() {
        let env = Env::default();
        let factory_id = env.register(Factory, ());
        let factory_client = FactoryClient::new(&env, &factory_id);

        let campaign_wasm_bytes = std::include_bytes!(
            "../../../target/wasm32v1-none/release/campaign.wasm"
        );
        let wasm = Bytes::from_array(&env, campaign_wasm_bytes);
        let wasm_hash = env.deployer().upload_contract_wasm(wasm);

        let admin = Address::generate(&env);
        env.mock_all_auths();
        factory_client.initialize(&admin, &wasm_hash);

        let creator = Address::generate(&env);
        let milestones = default_milestones(&env, &[300, 700]);
        let campaign_addr = factory_client.create_campaign(&creator, &String::from_str(&env, "Test Camp"), &1000, &1000000, &milestones);
        assert_eq!(factory_client.get_campaign_count(), 1);
        assert_eq!(factory_client.get_campaigns().len(), 1);
        assert_eq!(factory_client.get_campaigns().get(0).unwrap(), campaign_addr);

        let campaign_client = campaign::CampaignClient::new(&env, &campaign_addr);
        let (goal, raised, deadline) = campaign_client.get_info();
        assert_eq!(goal, 1000);
        assert_eq!(raised, 0);
        assert_eq!(deadline, 1000000);
        assert_eq!(campaign_client.get_milestones().len(), 2);
    }

    #[test]
    fn test_multiple_campaigns() {
        let env = Env::default();
        let factory_id = env.register(Factory, ());
        let factory_client = FactoryClient::new(&env, &factory_id);

        let campaign_wasm_bytes = std::include_bytes!(
            "../../../target/wasm32v1-none/release/campaign.wasm"
        );
        let wasm = Bytes::from_array(&env, campaign_wasm_bytes);
        let wasm_hash = env.deployer().upload_contract_wasm(wasm);

        let admin = Address::generate(&env);
        env.mock_all_auths();
        factory_client.initialize(&admin, &wasm_hash);

        let creator1 = Address::generate(&env);
        let creator2 = Address::generate(&env);
        let ms1 = default_milestones(&env, &[500]);
        let ms2 = default_milestones(&env, &[1000, 1000]);
        factory_client.create_campaign(&creator1, &String::from_str(&env, "Camp 1"), &500, &1000000, &ms1);
        factory_client.create_campaign(&creator2, &String::from_str(&env, "Camp 2"), &2000, &2000000, &ms2);
        assert_eq!(factory_client.get_campaign_count(), 2);
    }
}
