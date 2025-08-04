#####
# Variables - change these for any new deployment

aws_profile        = "__TEMPLATE_PROJ_SLUG__-all-access"
aws_account        = "340752841869"
prefix             = "__TEMPLATE_PROJ_TAG__"
region             = "us-east-1"
vpc_cidr           = "10.5.0.0/16"
private_subnet_1   = "10.5.1.0/24"
private_subnet_2   = "10.5.2.0/24"
private_subnet_3   = "10.5.3.0/24"
public_subnet_1    = "10.5.101.0/24"
public_subnet_2    = "10.5.102.0/24"
public_subnet_3    = "10.5.103.0/24"
availability_zone_1 = "us-east-1a"
availability_zone_2 = "us-east-1c"
availability_zone_3 = "us-east-1e"
container_port     = 8600
ses_domain         = "__TEMPLATE_DOMAIN__"
ses_from           = "noreply@__TEMPLATE_DOMAIN__"
ses_prevalidate = {
	"dude1":    "dude@whereever.com"
	"dude2":    "dude@yahoo.com"
}

# Environments
# Update the task_definition each time you rerun terraform after a CI/CD push
# TODO UNCOMMENT THESE ROWS FOR HOWEVER MANY ENVIRONMENTS YOU WISH TO HAVE
deployment_environments = {
  # TODO LEAVE TASK DEFINITIONS BLANK UNTIL PUSHING FIRST CI/CD IMAGES
  #"dev":   { web_domain: "dev.__TEMPLATE_DOMAIN__", hostname: "dev.__TEMPLATE_DOMAIN__",   tasks: 1, task_definition: "" },
  "stage" : { web_domain : "stage.__TEMPLATE_DOMAIN__", hostname : "stage-api.__TEMPLATE_DOMAIN__", tasks : 1, task_definition : "__TEMPLATE_PROJ_TAG__-api-stage-td:80" },
  "prod" : { web_domain : "app.__TEMPLATE_DOMAIN__", hostname : "app-api.__TEMPLATE_DOMAIN__", tasks : 1, task_definition : "__TEMPLATE_PROJ_TAG__-api-prod-td:26" }
}

# Keys should not overlap deployment_environments (nor should hostnames overlap)
peer_environments = {
  "peer-stage" : {  hostname : "node-stage.__TEMPLATE_DOMAIN__", port: 8607},
  "peer-prod" : {  hostname : "node.__TEMPLATE_DOMAIN__", port:  8617}
}

# Bastion
# TODO Create a key-pair in AWS EC2 console, and place the name below
bastion_ssh_key_name = "__TEMPLATE_PROJ_SLUG__-bastion-1"
bastion_whitelist = {
  "James_Loveland_CO" : { ip : "98.55.73.76/32" }
}

# You must set up an AWS certificate for this strategy (and Route53 to ALB)
# TODO ENTER YOUR CERT ARN
certificate_arn = "arn:aws:acm:us-east-1:340752841869:certificate/f85ee1d9-7c2e-4a8f-bb54-b6a999d40dfa"

# Tag values may only contain unicode letters, digits, whitespace, or one of these symbols: _ . : / = + - @
default_tags = {
  Application = "__TEMPLATE_PROJ_NAME__ Fargate - Terraform"
  Environment = "production"
}
