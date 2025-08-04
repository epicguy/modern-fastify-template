# Milieu package for managing environment variables and secrets

## How to set up a new environment

### Create a private/public keypair (showing RSA 2048 bit key)

(Note: replace ${ENV} with your environment name e.g. `stage` or use export ENV=stage to copy/paste)

```
openssl genrsa -out ${ENV}.private.pem 2048
openssl rsa -in ${ENV}.private.pem -pubout -out src/milieu/${ENV}.public.pem
```

### Put the private key into the AWS Parameter store

(Note: For 'local' dev env, copy the local.private.pem value into `env-api-template` and `env-api` at the bottom (`milieu_private_key=`.) More details are shown near the end of this document.)

- (Go here in the console) https://us-east-1.console.aws.amazon.com/systems-manager/parameters
- Choose `Create parameter`
- Use the key name: `/${prefix}-server/${ENV}-env/key-for-env-vars`
- Description: `Private key to decrypt environment variables for a given deployment environment instance (i.e Fargate task on ${ENV} env)`
- Tier: STANDARD
- Type: SecureString
- KMS key source: My current account
- KMS Key ID: (use the default alias)
- Value: contents of the file: `ENV.private.pem`. You can remove this file locally after you upload it.

### Create a policy and attach to Fargate task role

- After you create the parameter, you can view the details and copy the ARN to create a policy

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ssm:DescribeParameters"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ssm:GetParameters"
            ],
            "Resource": [
               "ARN-FOR-STAGE",
               "ARN-FOR-PROD"
            ]
        }
    ]
}
```

- Go here to create an IAM policy: https://us-east-1.console.aws.amazon.com/iam/home?region=us-east-1#/policies
- Filter the list by 'customer managed' and confirm you don't already have the ssm-parameter-store-fargate policy.
- (Note, if it already exists, you can edit it to add to the JSON, the ARNx to the existing Resource list.)
- Press "Create policy", pick 'JSON' format, paste the JSON above, and update ARNx with parameter store arn:
  - Looks something like `arn:aws:ssm:us-east-1:AWS_ACCOUNT:parameter/__TEMPLATE_PROJ_TAG__-server/ENV-env/key-for-env-vars`
- Policy name: ssm-parameter-store-fargate
- Policy desc: Access SSM-Parameter-store. Private key to decrypt environment variables for a given deployment environment instance

#### Attach new policy to ECS tasks

- Goto https://us-east-1.console.aws.amazon.com/iam/home?region=us-east-1#/roles
- Filter on 'ecs' - find the ...ecsTaskExecutionRole created by terraform, and click on the name.
- Choose 'add-permissions' 'attach policies'
- In the massive list of policies, filter on customer-managed, and find: ssm-parameter-store-fargate from above
- Check that box, then "Add permissions" to complete.
- Once attached you should have 2 policies - one for `AmazonECSTaskExecutionRolePolicy` and our new ssm policy

### Create your environment file with raw secrets that will then be sealed

- Create a file with the name `src/milieu/${ENV}.env.json`

```
{
   "_VAR_BUT_WITH_LEADING_UNDERSCORE": "secret to be sealed",
   "ANOTHER_VAR": "stays in plain text"
}
```

### Seal this secrets file

(_NOTE: WILL OVERWRITE `src/milieu/${ENV}.env.json` so make a copy unless you are already under version control_)

```
npx ts-node src/milieu ${ENV}
```

(_Note: you can seal multiple files with a comma separated list e.g. local,dev,stage,prod_)

### Commit the changes

- You should see the changes to `src/milieu/${ENV}.env.json` and `src/milieu/${ENV}.public.pem` in your git changes
- You should NOT see any `*private.pem` files in your git changelog (should be in .gitignore)
- You can remove the `*private.pem` files for security reasons at any time
- (_Note: if you are testing 'local' such that the private pem will not be injected into your container, you should add the private pem in your initial env-api load file (where you will set the milieu ENV VAR)_)

### Inject initial ENV VARS that reference your sealed file

- Milieu requires 2 initial ENV VARS upon startup. These are processed by server.js and milieu/index.js
- `milieu` should be set to your deployment environment string e.g. `stage`
- `milieu_private_pem` is set/injected with the deploy environment's private key

#### Depending on your deploy environment, choose the correct way to initially invoke milieu for proper startup:

- FARGATE: The task-definition file should have a `secrets` section where you reference the ssm parameter which will then be injected into your container at runtime. You also would set the milieu ENV VAR for the environment file you wish to load e.g. `stage`

```
         "environment": [
            {
               "name": "milieu",
               "value": "dev"
            }
         ],
         "secrets": [
            {
               "name": "milieu_private_key",
               "valueFrom": "/__TEMPLATE_PROJ_TAG__-server/dev-env/key-for-env-vars"
            }
         ],
```

- Local: Set the ENV VARS using the method you use when starting your server. For example, for a docker-compose.yaml start-up using env-api ...

```
milieu=local
milieu_private_key='
-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAzZcOc4UEsarXM3RUynZcaBCt/+Us7jG7FJPmmLRVJUCtzG2j
...
-----END RSA PRIVATE KEY-----
'
```
