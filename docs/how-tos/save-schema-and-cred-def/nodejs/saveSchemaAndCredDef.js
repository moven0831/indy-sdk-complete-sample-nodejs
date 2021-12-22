/**
 * Example demonstrating how to write Schema and Cred Definition on the ledger
 * As a setup, Steward (already on the ledger) adds Trust Anchor to the ledger.
 * After that, Steward builds the SCHEMA request to add new schema to the ledger.
 * Once that succeeds, Trust Anchor uses anonymous credentials to issue and store
 * claim definition for the Schema added by Steward.
 */

const indy = require('indy-sdk')
const util = require('./util')
const colors = require('./colors')

const log = console.log

function logValue() {
    log(colors.CYAN, ...arguments, colors.NONE)
}

async function run() {
    log("Set protocol version 2 to work with Indy Node 1.4")
    await indy.setProtocolVersion(2)
    

    // 1.
    log('1. Creates a new local pool ledger configuration that is used later when connecting to ledger.')
    const poolName = 'pool'
    const genesisFilePath = await util.getPoolGenesisTxnPath(poolName)
    const poolConfig = {'genesis_txn': genesisFilePath}
    try {
        await indy.createPoolLedgerConfig(poolName, poolConfig)
    } catch (e) {
        if (e.indyName === 'PoolLedgerConfigAlreadyExistsError') {}
        else { throw e }
    }
    // 2.
    log('2. Open pool ledger and get handle from libindy')
    const poolHandle = await indy.openPoolLedger(poolName, undefined)

    // 3.
    log('3. Creating new secure wallet')
    const walletName = {"id": "wallet"}
    const walletCredentials = {"key": "wallet_key"}
    try {
        await indy.createWallet(walletName, walletCredentials)
    } catch (e) {
        if (e.indyName === 'WalletAlreadyExistsError') {}
        else { throw e }
    }

    // 4.
    log('4. Open wallet and get handle from libindy')
    const walletHandle = await indy.openWallet(walletName, walletCredentials)

    // 5.
    log('5. Generating and storing steward DID and verkey')
    const stewardSeed = '000000000000000000000000Steward1'
    const did = {'seed': stewardSeed}
    const [stewardDid, stewardVerkey] = await indy.createAndStoreMyDid(walletHandle, did)
    logValue('Steward DID: ', stewardDid)
    logValue('Steward Verkey: ', stewardVerkey)

    // 6.
    log('6. Generating and storing trust anchor DID and verkey')
    const [trustAnchorDid, trustAnchorVerkey] = await indy.createAndStoreMyDid(walletHandle, "{}")
    logValue('Trust anchor DID: ', trustAnchorDid)
    logValue('Trust anchor Verkey: ', trustAnchorVerkey)

    // 7.
    log('7. Building NYM request to add Trust Anchor to the ledger')
    const nymRequest = await indy.buildNymRequest(
        /*submitter_did*/ stewardDid,
        /*target_did*/ trustAnchorDid,
        /*ver_key*/ trustAnchorVerkey,
        /*alias*/ undefined,
        /*role*/ 'TRUST_ANCHOR')

    // 8.
    log('8. Sending NYM request to the ledger')
    const nymTransactionResponse = await indy.signAndSubmitRequest(
        /*pool_handle*/ poolHandle,
        /*wallet_handle*/ walletHandle,
        /*submitter_did*/ stewardDid,
        /*request_json*/ nymRequest)

    logValue(`NYM transaction response: ${JSON.stringify(nymTransactionResponse)}`)

    // 9.
    log('9. Issuer create Credential Schema')
    const schema = {
        'name': 'gvt',
        'version': '1.0',
        'attributes': '["age", "sex", "height", "name"]'
    }

    const [issuerSchemaId, issuerSchemaJson] = await indy.issuerCreateSchema(
        stewardDid, 
        schema['name'],
        schema['version'],
        schema['attributes'])
    
    logValue(`Schema(${issuerSchemaId}): ${JSON.stringify(issuerSchemaJson)}`)

    // 10.
    log('10. Build the SCHEMA request to add new schema to the ledger')
    const schemaRequest = await indy.buildSchemaRequest(stewardDid, issuerSchemaJson)
    logValue(`Schema request: ${schemaRequest}`)

    // 11.
    log('11. Sending the SCHEMA request to the ledger')
    const schemaResponse = await indy.signAndSubmitRequest(
        poolHandle,
        walletHandle,
        stewardDid,
        schemaRequest)
    
    logValue(`Schema response: ${JSON.stringify(schemaResponse)}`)


    // 12.
    log('12. Creating and storing Credential Definition using anoncreds as Trust Anchor, for the given Schema')
    const credDefTag = 'TAG1'
    const credDefType = 'CL'
    const credDefConfig = {"support_revocation": false}

    const [credDefId, credDefJson] = await indy.issuerCreateAndStoreCredentialDef(
        walletHandle,
        trustAnchorDid,
        issuerSchemaJson,
        credDefTag,
        credDefType,
        credDefConfig)
    
    logValue(`Credential Definition(${credDefId}): ${JSON.stringify(credDefJson)}`)

    // 13.
    log('13. Closing wallet and pool')
    await indy.closeWallet(walletHandle)
    await indy.closePoolLedger(poolHandle)

    // 14.
    log('14. Deleting created wallet')
    await indy.deleteWallet(walletName, walletCredentials)

    // 15.
    log('15. Deleting pool ledger config')
    await indy.deletePoolLedgerConfig(poolName)


}


try {
    run()
} catch (e) {
    log("ERROR occured : e")
}
