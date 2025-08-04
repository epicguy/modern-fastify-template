#####
# Variable definitions (fill in terraform.tfvars)

variable "aws_profile" {
  description = "AWS creds profile from ~/.aws/credentials"
  type        = string
}

variable "aws_account" {
  description = "AWS account number for ARN strings"
  type        = string
}

variable "prefix" {
  description = "Main prefix for all resources"
  type        = string
}

variable "region" {
  description = "Main region for all resources"
  type        = string
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the main VPC"
}

variable "public_subnet_1" {
  type        = string
  description = "CIDR block for public subnet 1"
}

variable "public_subnet_2" {
  type        = string
  description = "CIDR block for public subnet 2"
}

variable "public_subnet_3" {
  type        = string
  description = "CIDR block for public subnet 3"
}

variable "private_subnet_1" {
  type        = string
  description = "CIDR block for private subnet 1"
}

variable "private_subnet_2" {
  type        = string
  description = "CIDR block for private subnet 2"
}

variable "private_subnet_3" {
  type        = string
  description = "CIDR block for private subnet 3"
}

variable "availability_zone_1" {
  type        = string
  description = "First availibility zone"
}

variable "availability_zone_2" {
  type        = string
  description = "Second availibility zone"
}

variable "availability_zone_3" {
  type        = string
  description = "Third availibility zone"
}

variable "bastion_ssh_key_name" {
  type        = string
  description = "Bastion Public key type"
}

variable "bastion_whitelist" {
  type        = map(any)
  description = "Bastion Whitelisted IPs"
}

variable "peer_ssh_key_name" {
  type        = string
  description = "peer Public key type"
}

variable "peer_whitelist" {
  type        = map(any)
  description = "peer Whitelisted IPs"
}

variable "default_tags" {
  type = map(any)
}

variable "container_port" {
  description = "Port that needs to be exposed for the application"
}

variable "ses_domain" {
  type = string
}

variable "ses_from" {
  type = string
}

variable "ses_prevalidate" {
  type = map(any)
}

variable "deployment_environments" {
  type = map(any)
}

variable "peer_environments" {
  type = map(any)
}

variable "certificate_arn" {
  type        = string
  description = "Existing ARN of the certificate for HTTPS on the ALB"

}
