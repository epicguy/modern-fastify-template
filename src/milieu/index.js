/**
 * Milieu - support loading environment vars (per deploy environment) including sealed secrets into process.env
 *
 * If you have to decode a secret locally, with a private.pem file (e.g. prod env)...
 * (export milieu_private_key=`cat ../prod.private.pem`; node)
 * > process.argv=['x','y']
 * > const m= require('./src/milieu');
 * > m.load('prod')
 * > process.env.AUTH_KEY
 */

const crypto = require('crypto');
const fs = require('fs');
const version = '~~a';
const versionPattern = new RegExp(version);

// Load an environment-variable json file (any _* keys are sealed), decode, and put results into the ENV
// Input is the deployed environment string(s) (e.g. 'dev', or ['prod','stage'], or 'prod,stage,dev,local')
const load = async (runtimeEnvironmentString) => {
  if (runtimeEnvironmentString == null || runtimeEnvironmentString == '') {
    console.error('milieu::load: WARNING: NO runtimeEnvironmentString.');
    return;
  }
  const privateKeyPEM = process.env.milieu_private_key;
  const privateKey = crypto.createPrivateKey(privateKeyPEM);
  const env = require(`./${runtimeEnvironmentString}.env.json`);

  Object.keys(env).forEach((k) => {
    if (process.env[k[0] === '_' ? k.slice(1) : k]) return; // Allow any pre-set ENV VAR override this file
    let v = env[k];
    if (k[0] === '_') {
      if (!v.match(versionPattern)) throw new Error('Invalid sealed value for hash: ' + k);
      process.stdout.write(k + ', '); // Debug help
      v = crypto.privateDecrypt(privateKey, Buffer.from(v.slice(version.length), 'base64')).toString();
      k = k.slice(1);
    }
    //console.log({ k, v });
    process.env[k] = v;
  });
  process.stdout.write('loaded.\n');
};

// Seal a list of env values using a public key
// Given an env-spec (i.e 'dev' or ['dev','stage'] or 'prod,stage') rewrite env file with _* keys 'sealed' with public key
//
// Steps:
// - for each env-string
//  - Read the public key in (expect pem format string)
//  - 'require' the <env-string>.env.json file which has one exports of an object of hash values
//  - Loop on each key in this hash, and create a new entrypted value for each _* hash into a new object
//  - Note, where a value is already entcrypted (i.e. has 'version' prefix) just leave as is, since it is not changing
//  - Write out a new json file over the existing file
//

const seal = (runtimeEnvironmentSpec) => {
  const runtimeEnvironmentArray = typeof runtimeEnvironmentSpec === 'string' ? runtimeEnvironmentSpec.split(',') : runtimeEnvironmentSpecplit;
  for (const runtimeEnvironmentString of runtimeEnvironmentArray) {
    const file = `./src/milieu/${runtimeEnvironmentString}.env.json`;
    const filePem = `./src/milieu/${runtimeEnvironmentString}.public.pem`;
    const publicKeyText = fs.readFileSync(filePem);
    const publicKey = crypto.createPublicKey(publicKeyText);

    const newObject = {};
    const raw = JSON.parse(fs.readFileSync(file));
    Object.keys(raw).forEach((k) => {
      let v = raw[k];
      if (k[0] === '_' && !v.match(versionPattern)) {
        v = version + crypto.publicEncrypt(publicKey, Buffer.from(v)).toString('base64');
      }
      newObject[k] = v; // Keep undersore on 'k' for 'load' and when updating this file with 'seal'
    });
    fs.writeFileSync(file, JSON.stringify(newObject, null, '\t'));
  }
};

module.exports = { load, seal };

if (process.argv[1].match(/milieu/) && process.argv.length > 2) {
  console.log('Running command line seal using: ', process.argv[2]);
  seal(process.argv[2]);
}
