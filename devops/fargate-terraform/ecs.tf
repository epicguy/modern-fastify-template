#####
# ECS: Cluster, Services (each deployemnt-environemnt)

resource "aws_ecs_cluster" "ecs_cluster" {
  name = "${var.prefix}-ecs-cluster"
}

resource "aws_ecs_service" "ecs_service" {
  for_each            = var.deployment_environments
  name                = "${var.prefix}-api-${each.key}-service"
  cluster             = aws_ecs_cluster.ecs_cluster.arn
  task_definition     = each.value.task_definition
  launch_type         = "FARGATE"
  scheduling_strategy = "REPLICA"
  desired_count       = each.value.tasks # the number of tasks you wish to run

  network_configuration {
    subnets          = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id, aws_subnet.private_subnet_2.id]
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs_sg.id, aws_security_group.alb_sg.id]
  }

  # This block registers the tasks to a target group of the loadbalancer.
  load_balancer {
    target_group_arn = aws_lb_target_group.target_group[each.key].arn
    container_name   = "${var.prefix}-nodejs-api-${each.key}"
    container_port   = var.container_port
  }
  depends_on = [aws_lb_listener.https]
}
