#####
# Security-groups
# ECS: (For all services) ecs_sg (alb_sg IN, all OUT)
# ALB: (For inbound http(s)) alb_sg (all:80 IN, all:443 IN, all OUT)
# Bastion (for ssh to DB)

resource "aws_security_group" "ecs_sg" {
  vpc_id                 = aws_vpc.vpc.id
  name                   = "${var.prefix}-sg-ecs"
  description            = "Security group for ecs app"
  revoke_rules_on_delete = true
}

resource "aws_security_group_rule" "ecs_alb_ingress" {
  type                     = "ingress"
  from_port                = 0
  to_port                  = 0
  protocol                 = "-1"
  description              = "Allow inbound traffic from ALB"
  security_group_id        = aws_security_group.ecs_sg.id
  source_security_group_id = aws_security_group.alb_sg.id
}

resource "aws_security_group_rule" "ecs_all_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  description       = "Allow outbound traffic from ECS"
  security_group_id = aws_security_group.ecs_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group" "alb_sg" {
  vpc_id                 = aws_vpc.vpc.id
  name                   = "${var.prefix}-sg-alb"
  description            = "Security group for alb"
  revoke_rules_on_delete = true
}

resource "aws_security_group_rule" "alb_http_ingress" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "TCP"
  description       = "Allow http inbound traffic from internet"
  security_group_id = aws_security_group.alb_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}
resource "aws_security_group_rule" "alb_https_ingress" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "TCP"
  description       = "Allow https inbound traffic from internet"
  security_group_id = aws_security_group.alb_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

// NOTE: SECURITY COULD LIMIT THE PORTS AND SOURCE AS container_port AND FARGATE-SERVICE (ecs_sg)
// https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-update-security-groups.html
resource "aws_security_group_rule" "alb_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  description       = "Allow outbound traffic from alb"
  security_group_id = aws_security_group.alb_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group" "bastion_sg" {
  vpc_id                 = aws_vpc.vpc.id
  name                   = "${var.prefix}-sg-bastion"
  description            = "Security group for bastion app"
  revoke_rules_on_delete = true
}

resource "aws_security_group_rule" "bastion_alb_ingress" {
  for_each          = var.bastion_whitelist
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "TCP"
  description       = "For: ${each.key}"
  security_group_id = aws_security_group.bastion_sg.id
  cidr_blocks       = [each.value.ip]
}

resource "aws_security_group_rule" "bastion_all_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  description       = "Allow outbound traffic from Bastion"
  security_group_id = aws_security_group.bastion_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group" "postgres_sg" {
  vpc_id                 = aws_vpc.vpc.id
  name                   = "${var.prefix}-sg-postgres"
  description            = "Security group for postgres db"
  revoke_rules_on_delete = true
}

resource "aws_security_group_rule" "postgres_alb_ingress_ecs" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "TCP"
  description              = "Allow local ecs port access"
  security_group_id        = aws_security_group.postgres_sg.id
  source_security_group_id = aws_security_group.ecs_sg.id
}

resource "aws_security_group_rule" "postgres_alb_ingress_bastion" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "TCP"
  description              = "Allow local ecs port access"
  security_group_id        = aws_security_group.postgres_sg.id
  source_security_group_id = aws_security_group.bastion_sg.id
}

# Peer - allow SSH, also API (tls) and peer-port

resource "aws_security_group" "peer_sg" {
  vpc_id                 = aws_vpc.vpc.id
  name                   = "${var.prefix}-sg-peer"
  description            = "Security group for peer app"
  revoke_rules_on_delete = true
}

resource "aws_security_group_rule" "peer_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  description       = "Allow outbound traffic from peer"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "peer_ingress_ssh_whitelist" {
  for_each          = var.peer_whitelist
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "TCP"
  description       = "For: ${each.key}"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = [each.value.ip]
}

resource "aws_security_group_rule" "peer_ingress_api_tls" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "TCP"
  description       = "Peer API TLS all"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# Stage peer w/o certificate
resource "aws_security_group_rule" "peer_ingress_api_http_stage" {
  type              = "ingress"
  from_port         = 8607
  to_port           = 8607
  protocol          = "TCP"
  description       = "Peer API HTTP all"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "peer_ingress_api_http_prod" {
  type              = "ingress"
  from_port         = 8617
  to_port           = 8617
  protocol          = "TCP"
  description       = "Peer API HTTP all"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "peer_ingress_peering" {
  type              = "ingress"
  from_port         = 18888
  to_port           = 18888
  protocol          = "TCP"
  description       = "Peering 18888 any"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}
resource "aws_security_group_rule" "peer_ingress_peering_stage" {
  type              = "ingress"
  from_port         = 19999
  to_port           = 19999
  protocol          = "TCP"
  description       = "Peering 19999 any"
  security_group_id = aws_security_group.peer_sg.id
  cidr_blocks       = ["0.0.0.0/0"]
}

