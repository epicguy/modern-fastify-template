# Terraform scripts for AWS Fargate (Stage and Production)

The scripts in this directory can be run against your AWS account. It includes all the Network infrastructure, load-balancers, Database, and a bastion server for secure DB access.

## Initial setup

#### Prerequisites in your AWS account

- Create / Sign-up for an AWS organization.
- Create an admin account. For simplicity, create API credentials you will use for the Terraform commands
- Populate your ~/.aws/credentials file similar to below.

```
[__TEMPLATE_PROJ_SLUG__-all-access]
region = us-east-1
aws_access_key_id = AKIAVZZZZZZZZZZZZZZZ
aws_secret_access_key = xxxxxxxxxxxxxyyyyyyyyyyyyyzzzzzzzzzzzzzzz
```

- You will need a certificate in ACM for use by the load-balancer (a certificate ARN is needed). You may wish to import your domain to Route53 so you can create a certificate that auto-renews, or you may use the ACM dashboard to get a certificate for a domain hosted elsewhere.
- You will need to create a keypair for the bastion (jump server.) Do this in the EC2 console. The name you choose will go into the Terraform scripts as described below.
- After you have running ECS Fargate containers, you may see an error in the ECS console indicating that the log groups are missing. You can then manually create them to get this warning to clear, and to view server logs.

#### Running Terraform the first time

- Install Terraform on your local system
- `cd devops/fargate-terraform` to perform these next steps
- Ensure you do not have any tfstate files (including no backups); remove .terraform.lock.hcl file.
- Edit the terraform.tfvars files and populate all the values you wish to customize
- Search for `TODO` in these \*.tf scripts and update anything needed (ignore `TODO_CHANGE_LATER` on the DB password.)
  - One of these TODOs is to create the named keypair for the bastion. Do this in the AWS EC2 console.
  - If you wish to change the bastion server instance / OS, you can look for named filters (for ec2.tf) using `aws --profile james-dtsol ec2 describe-images --owners amazon --filters "Name=name,Values=al2023*" --query 'sort_by(Images, &CreationDate)[].Name'| grep hvm | grep arm` (or grep x86); use t4g.nano for smallest arm based OS-image, or t3.micro for smallest x86 based OS-image. Modify filter.values and instance_type with your choices.
- You will be running the terraform scripts more than once, due to a catch-22 with Fargate services and task definitions.
  - Follow the steps below until all resources are created except the two exceptions fo the ECS services for each environment (expect the error ...TaskDefinition can not be blank.) There is a note below for when to run the CI/CD pipeline, and then these services can be created.
- Run the command `terraform init` which you only need to do one time, to download any 'providers' packages.
  - You can always run `terraform plan` to see what would happen if you ran `terraform apply`
  - You can always run `terraform apply` and still choose to exit or apply the 'plan' that is generated.
  - If you want to change infrastructure later, after an apply, just update the terraform scripts, and run again.
- Run `terraform apply` and note what resources will be created.
  - If you like that 'plan' go ahead and apply it.
  - If you see something you want to change, abort and edit the scripts
  - If the program complains that something is not right, you will have to address it (add some missing reference.)
- Initially creating the Database takes the most time (like 20 mins.)
- Once all that is created and complete, we need to run the pipeline to create the task definitions, and then we can modify terraform.tfvars to populate the task_definition values.
  - Run the pipeline 'actions', to successfully push an image and attempt setting the service task definition. Check the root [README.md](../../README.md) for how to get the `Github Actions` working.
  - The pipeline error you are waiting for is under the step called 'AWS - update service' with the error: `An error occurred (ServiceNotFoundException) when calling the UpdateService operation`
  - Go to the ECS dashboard, on the left pick 'task definitions'; Copy the name of the active entry (including the colon and the number e.g. `__TEMPLATE_PROJ_TAG__-api-stage-td:1`) (This works for the stage environment; eventually you'll need to promote a production image to get and set the production task-def and service.)
  - Once we have our task definition, edit terraform.tfvars, update the task_definition for that environment, and re-run `terraform apply`
  - When that environment's service has been created, you should be able to manually re-run the pipeline to start that service with the given task-definition / image. (Check the ECS console after the pipeline succeeds.)
- Anytime we have done an `apply` it is critical that we put our new/modified tfstate files into the repository.
  - Anytime we wish to run `terraform apply` we must first ensure we have the latest tfstate files from the repo.
  - This strategy also requires that we ensure no one else is running these scripts at the same time.
  - After any change to the AWS resources, push the tfstate files back into the repo
- For security, go to the RDS console, and change your DB's root password. Your devs will need this value.
- Ongoing: if these instructions are failing, update this README.md with the correct information; thanks!

#### Post-requisites for AWS account

- You will need to connect the environment URLs to the load-balancer.
  - Go to Route53 and in your domain, add e.g. stage as an `A` record (as alias) to the us-east-1 ALB `prefix-alb`
  - If you have a non-AWS domain, add the CNAME record using the ALB DNS name, e.g. `prefix-alb-99999.us-east-1.elb.amazonaws.com`
- For the CI/CD pipeline check the [README.md](../../support_build/README.md) there for adding a user and policy for pushing images and starting services
- _TODO MAYBE MOVE THE GITHUB ACTIONS INSTRUCTIONS TO THE SUPPORT_BUILD OR DEVOPS DIRS_

### Verify connectivity

#### Browser to STAGE environment

- You must have stage.your.domain pointing to the AWS load balancer. In Route53 you can use 'create record' and choose an 'alias'.
- The load-balancer will check the health using `/api/v1/Ping`
- Confirm the service has launched and is healthy using the ECS console, go to the cluster, then the service, and view running task state.
- Put your domain name into the browser location bar; if you get 503 your service is not working. If you get 'this site cannot be reached' your domain name has not yet propagated.

#### Bastion via SSH

- The keypair you created for the bastion, if downloaded as a pem, can be copied into ~/.ssh
- Get the IPv4 public address of your bastion from the EC2 console (left links: Elastic IPs).
- Add an entry to your ~/.ssh/config

```
Host prefix-bastion
HostName THE-PUBLIC-IPv4
User ec2-user
IdentityFile ~/.ssh/THE-KEY-PAIR-NAME.pem
Protocol 2
```

- Confirm that you can get to that server using e.g. `ssh prefix-bastion`

#### Database access from Bastion server

- The security groups are set up to allow the bastion direct access to the database, so preform the following commands from the bastion server.
- You may have to install a database specific CLI on this server i.e. `sudo dnf install postgresql15`
  - Alternatively (for CLI) you can create an SSH tunnel, e.g.
  - `ssh -fN -L 8611:prefix-postgres-db.xxxx.us-east-1.rds.amazonaws.com:5432 ssh-bastion-alias`
  - (and then connect using `--host localhost --port 8611`)
- You should have the root password from the previous steps (or create a new one in the RDS console anytime.)
- Use the RDS console to get the hostname for this DB (called Endpoint) e.g. `prefix-postgres-db.xxx3zzzzyyyy.us-east-1.rds.amazonaws.com`
- Note the Username and DB-name from terraform's database tf definition: (i.e. `postrgres.tf` has `username = "aws_root"` and `db_name  = var.prefix`) so your project-prefix is the DB name.
- Connect using e.g.: `psql -h prefix-postgres-db.xxxyyyyzzzz.us-east-1.rds.amazonaws.com -U aws_root -d prefix`

### DOCS

https://developer.hashicorp.com/terraform/tutorials/aws/aws-rds

- Shows how to use terraform changes to manage DB instance (like upgrade disk size)

## Initialize a Database environment

### Run SQL to create initial DB and users / triggers, etc.

This example can be run from the bastion cmdline. Make note of the value from the openssl command, to use in the last step. You can also do this again to re-init the STAGE DB when the schema changes in V002\_\_base.sql prior to moving to migrations once the schema is stable.

#### Copy assets to bastion, and switch to there

```
scp -r db __TEMPLATE_PROJ_SLUG__:.
ssh __TEMPLATE_PROJ_SLUG__
```

#### Run these commands on the bastion

```
openssl rand -base64 16
DBNAME=__TEMPLATE_PROJ_TAG___stage
psql -h __TEMPLATE_PROJ_TAG__-postgres-db.ch0eyq8m6xkm.us-east-1.rds.amazonaws.com -U aws_root -d __TEMPLATE_PROJ_TAG__ --echo-all -v db=$DBNAME <db/init.sql
psql -h __TEMPLATE_PROJ_TAG__-postgres-db.ch0eyq8m6xkm.us-east-1.rds.amazonaws.com -U aws_root -d __TEMPLATE_PROJ_TAG__ --echo-all -v db=$DBNAME <db/load.sql
```

Next, see the RUNBOOK entry for setting the api user password in [README.md](../../README.md)

#### Or run it this way

Alternately, to log in just once, and do this on the bastion, first copy the db files using e.g. `scp -r db __TEMPLATE_PROJ_SLUG__:.` then:

```
openssl rand -base64 16
psql -h __TEMPLATE_PROJ_TAG__-postgres-db.ch0eyq8m6xkm.us-east-1.rds.amazonaws.com -U aws_root -d __TEMPLATE_PROJ_TAG__
\set db __TEMPLATE_PROJ_TAG___stage
\i init.sql # BUG: db/scripts/V1... when in 'db' dir (where init.sql is) does not work (mkdir db;mv scripts db/.)
\i load.sql
ALTER USER __TEMPLATE_PROJ_TAG___stage_api_user WITH PASSWORD `the-openssl-value`;
```
