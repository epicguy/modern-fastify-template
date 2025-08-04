# Monitor Errors

The idea is to use an independent server (such as our bastion) to hit the `/Health`
endpoints of our API server, which will generate discord messages if issues are found.
The scripts are run using the `cron` process on the host system (e.g. the bastion server.)
Update: also added daily bastion-cron health, and some endpoints (/#!/login and /api/v1/Ping)

## Installation

### Install crontab

This cheaper version of the AMI does not have crontab included. These steps seem to work: https://jainsaket-1994.medium.com/installing-crontab-on-amazon-linux-2023-ec2-98cf2708b171

```
sudo yum install cronie -y
sudo systemctl enable crond.service
sudo systemctl start crond.service
sudo systemctl status crond | grep Active # Check that it worked
```

### Install the files

Copy devops/bastion to the ec2-user root account. The `bin` directory has a few scripts, and the root directory has our sample `crontab` (Note: It would be good to keep the bastion directory clean from files that do not go between the server and the repo, so we can copy between them freely.) If you hae your bastion in ssh as `__TEMPLATE_PROJ_SLUG__` then you could do:

```
scp -r devops/bastion/* __TEMPLATE_PROJ_SLUG__:.
```

On the bastion, you may need to: `chmod +x bin/*sh`

### Install the crontab for use by the cron service

The copy-n-paste method: `cat crontab` and copy the output. As the ec2-user, use the command:

```
crontab -e
```

and paste into the editor, the contents of the `crontab` file. Save this.

### Add `.cron_creds` file

Follow the instructions in the top of the crontab file, to create the ENV vars needed for crontab scripts. See 'Security' below.

### Watch for output

According to the times set on each line of the `crontab` file, expect the scripts to be run. Any output (stdin/stderr) will appear in one of the files: `cron_*.log`. (Note: You can speed up the testing by manually modifying the crontab to run e.g. each min, temporarily.)

### Look for discord messages

If any errors are detected, there should be a discord message in the `alerts` discord channel. Also, daily you should get the bastion-cron health message (or else cron is not running anymore.)

## Security

The `export cred=` line in the crontab should have our Basic-auth for the /Health and /Status endpoints.

#### TODO: (DONE) Update /Health and /Status to allow output=discord type requests to have a special non-sensitive output, and assign an additional basic-auth for just this purpose.

The `export discord_url=` line in the crontab file, could be considered sensitive. Update it with the ALERT channel value.

## Testing and changes

Typically these scripts and the crontab have to be tested by running them on the bastion. Once things are working well there, they can be copied back to this repo.

You should wait for the cron to run each of these to ensure the ENV and commands are set right from crontab. You may wish to modify the crontab frequency values to get the scripts to run quicker for testing.

To test a script locally for e.g. syntax errors and for different use-cases, you can run them directly, but will need to set the discord_url directly. Other vars can be overwritten in some cases for edge-case testing. For example:

```
discord_url=zzz # or source .cron_creds
percent_warn=30 silent=-v ./bin/daily_cron.sh
```

This is how I copy back to the repo.

### Copy the crontab first

While on the bastion, run: `crontab -l > crontab` to make a copy of what is currently running.
Exit from the ssh terminal.
Assuming your ssh is set up as hostname `'__TEMPLATE_PROJ_SLUG__'` do: `scp __TEMPLATE_PROJ_SLUG__:crontab devops/bastion/.`

### Copy the bin files

Do: `scp __TEMPLATE_PROJ_SLUG__:bin/\*.sh devops/bastion/bin/.`
