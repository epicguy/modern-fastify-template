#####
# ALB (as alb_sg and public subnets), Listners (80:redirect,443:each-ecs-service), Target Groups (each ecs-service)

resource "aws_alb" "application_load_balancer" {
  name               = "${var.prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = [aws_subnet.public_subnet_1.id, aws_subnet.public_subnet_2.id, aws_subnet.public_subnet_3.id]
  security_groups    = [aws_security_group.alb_sg.id]
}

resource "aws_lb_target_group" "target_group" {
  for_each             = var.deployment_environments
  name                 = "${var.prefix}-${each.key}-tg"
  port                 = var.container_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.vpc.id
  deregistration_delay = 30 # Speeds up deploys from default 5min
  health_check {
    path                = "/api/v1/Ping"
    protocol            = "HTTP"
    matcher             = "200"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 10
    interval            = 30
  }
}

resource "aws_lb_target_group" "target_group_peer" {
  for_each = var.peer_environments
  name     = "${var.prefix}-${each.key}-tg"
  port     = each.value.port
  protocol = "HTTP"
  # (instance) target_type          = "ip"
  vpc_id               = aws_vpc.vpc.id
  deregistration_delay = 30 # Speeds up deploys from default 5min
  health_check {
    path                = "/api/v1/accounts/11"
    protocol            = "HTTP"
    matcher             = "200"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 10
    interval            = 30
  }
}

#Defines an HTTP Listener(s) for the ALB
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_alb.application_load_balancer.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      host        = "#{host}"
      path        = "/#{path}"
      port        = jsonencode(443)
      protocol    = "HTTPS"
      query       = "#{query}"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  certificate_arn   = var.certificate_arn
  load_balancer_arn = aws_alb.application_load_balancer.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  default_action {
    target_group_arn = aws_lb_target_group.target_group["prod"].arn
    type             = "forward"
  }
}

resource "aws_lb_listener_rule" "for_service" {
  for_each     = var.deployment_environments
  tags         = { Name = each.key }
  listener_arn = aws_lb_listener.https.arn
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.target_group[each.key].arn
  }
  condition {
    host_header { values = [each.value.hostname] }
  }
}
resource "aws_lb_listener_rule" "for_peer" {
  for_each     = var.peer_environments
  tags         = { Name = each.key }
  listener_arn = aws_lb_listener.https.arn
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.target_group_peer[each.key].arn
  }
  condition {
    host_header { values = [each.value.hostname] }
  }
}

resource "aws_lb_target_group_attachment" "peer" {
  for_each         = var.peer_environments
  target_group_arn = aws_lb_target_group.target_group_peer[each.key].arn
  target_id        = aws_instance.peer-2.id
  #port             = 8000
}
