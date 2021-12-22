/**
 * Example demonstrating how to add DID with the role of Trust Anchor as Steward.
 *
 * Shows how to issue a credential as a Trust Anchor which has created a Cred Definition
 * for an existing Schema.
 * After Trust Anchor has successfully created and stored a Cred Definition using Anonymous Credentials,
 * Prover's wallet is created and opened, and used to generate Prover's Master Secret.
 * After that, Trust Anchor generates Credential Offer for given Cred Definition, using Prover's DID
 * Prover uses Credential Offer to create Credential Request
 * Trust Anchor then uses Prover's Credential Request to issue a Credential.
 * Finally, Prover stores Credential in its wallet.
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
    log('3. Creating Issuer wallet and opening it to get the handle')
    const issuerWalletConfig = {"id": "wallet"}
    const issuerWalletCredentials = {"key": "wallet_key"}
    try {
        await indy.createWallet(issuerWalletConfig, issuerWalletCredentials)
    } catch (e) {
        if (e.indyName === 'WalletAlreadyExistsError') {}
        else { throw e }
    }

    // 4.
    log('4. Open wallet and get handle from libindy')
    const issuerWalletHandle = await indy.openWallet(issuerWalletConfig, issuerWalletCredentials)

    // 5.
    log('5. Generating and storing steward DID and verkey')
    const stewardSeed = '000000000000000000000000Steward1'
    const did = {'seed': stewardSeed}
    const [stewardDid, stewardVerkey] = await indy.createAndStoreMyDid(issuerWalletHandle, did)
    logValue('Steward DID: ', stewardDid)
    logValue('Steward Verkey: ', stewardVerkey)

    // 6.
    log('6. Generating and storing trust anchor DID and verkey')
    const [trustAnchorDid, trustAnchorVerkey] = await indy.createAndStoreMyDid(issuerWalletHandle, "{}")
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
        /*wallet_handle*/ issuerWalletHandle,
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
        issuerWalletHandle,
        stewardDid,
        schemaRequest)
    
    logValue(`Schema response: ${JSON.stringify(schemaResponse)}`)


    // 12.
    log('12. Creating and storing Credential Definition using anoncreds as Trust Anchor, for the given Schema')
    const credDefTag = 'TAG1'
    const credDefType = 'CL'
    const credDefConfig = {"support_revocation": false}

    const [credDefId, credDefJson] = await indy.issuerCreateAndStoreCredentialDef(
        issuerWalletHandle,
        trustAnchorDid,
        issuerSchemaJson,
        credDefTag,
        credDefType,
        credDefConfig)
    
    logValue(`Credential Definition(${credDefId}): ${JSON.stringify(credDefJson)}`)

    // 13.
    log('13. Creating Prover wallet and opening it to get the handle')
    const proverDid = 'VsKV7grR1BUE29mG2Fm2kX'
    const proverWalletConfig = {"id": "prover_wallet"}
    const proverWalletCredentials = {"key": "prover_wallet_key"}
    try {
        await indy.createWallet(proverWalletConfig, proverWalletCredentials)
    } catch (e) {
        if (e.indyName === 'WalletAlreadyExistsError') {}
        else { throw e }
    }
    const proverWalletHandle = await indy.openWallet(proverWalletConfig, proverWalletCredentials)

    // 14.
    log('14. Prover is creating Link Secret')
    const proverLinkSecretName = 'link_secret'
    try {
        const linkSecretId = await indy.proverCreateMasterSecret(proverWalletHandle, proverLinkSecretName)
    } catch (e) {
        if (e.indyName === 'AnoncredsMasterSecretDuplicateNameError') {}
        else { throw e }
    }

    // 15.
    log('15. Issuer (Trust Anchor) is creating a Credential Offer for Prover')
    const credOfferJson = await indy.issuerCreateCredentialOffer(issuerWalletHandle, credDefId)
    logValue(`Credential Offer: ${JSON.stringify(credOfferJson)}`)

    // 16.
    log('16. Prover creates Credential Request for the given credential offer')
    const [credReqJson, credReqMetadataJson] = await indy.proverCreateCredentialReq(
        proverWalletHandle,
        proverDid,
        credOfferJson,
        credDefJson,
        proverLinkSecretName)
    logValue(`Credential Request: ${JSON.stringify(credReqJson)}`)
    
    // 17.
    log('17. Issuer (Trust Anchor) creates Credential for Credential Request')
    const credValueJson = {
        "sex": {"raw": "male", "encoded": "5944657099558967239210949258394887428692050081607692519917050011144233"},
        "name": {"raw": "Alex", "encoded": "1139481716457488690172217916278103335"},
        "height": {"raw": "175", "encoded": "175"},
        "age": {"raw": "28", "encoded": "28"}
    }

    const [credJson, _, __] = await indy.issuerCreateCredential(
        issuerWalletHandle,
        credOfferJson,
        credReqJson,
        credValueJson, null, NaN)
    logValue(`Credential: ${JSON.stringify(credJson)}`)

    // 18.
    log('18. Prover processes and stores received Credential')
    await indy.proverStoreCredential(
        proverWalletHandle, null,
        credReqMetadataJson,
        credJson,
        credDefJson, null)

    

    // 19.
    log('19. Closing wallet and pool')
    await indy.closeWallet(issuerWalletHandle)
    await indy.closeWallet(proverWalletHandle)
    await indy.closePoolLedger(poolHandle)

    // 20.
    log('20. Deleting created wallet')
    await indy.deleteWallet(issuerWalletConfig, issuerWalletCredentials)
    await indy.deleteWallet(proverWalletConfig, proverWalletCredentials)

    // 20.
    log('21. Deleting pool ledger config')
    await indy.deletePoolLedgerConfig(poolName)
}

try {
    run()
} catch (e) {
    log("ERROR occured : e")
}
