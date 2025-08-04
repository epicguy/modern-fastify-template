#####
# EC2 (peer-2 on public)
# Note: Using t3a-class ami (t4g is arm64 so not usable at this time)

resource "aws_instance" "peer-2" {
  ami                         = "ami-012967cc5a8c9f891" # data.aws_ami.peer-2.id
  associate_public_ip_address = true
  instance_type               = "t3a.xlarge"
  key_name                    = var.peer_ssh_key_name
  root_block_device {
    volume_size = 250
  }
  vpc_security_group_ids = [aws_security_group.peer_sg.id]
  subnet_id              = aws_subnet.public_subnet_1.id
  ipv6_address_count     = 1
  tags = {
    Name = "${var.prefix}-peer-2"
  }
}

resource "aws_eip" "peer-t4g-4" {
  domain   = "vpc"
  instance = aws_instance.peer-2.id
  tags = {
    Name = "${var.prefix}-eip-peer-2"
  }

}
