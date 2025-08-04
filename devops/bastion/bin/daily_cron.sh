##
## Daily cron: curl to discord once a day that cron on bastion/ec2-user is running
##  (check disk space)
##
## Usage: ./scriptname.sh
## ENV has: discord_url
##
echo == `date` == $0 $1 $2 $3

if [ -z "$discord_url" ]; then
	echo "Missing ENV discord_url"
	exit 101
fi

## Variables
icon=green_circle
script_name=$( echo $0 | cut -d/ -f5)
percent_warn=${percent_warn:-30}
silent=${silent:---silent}
#silent=-v

## Utiltiy
#set -e
display () {
	discord_output="{\"content\":\":${icon}: *[bastion ${script_name}]* $1\"}"
	echo "$discord_output"
	#echo $1
	curl $discord_url $silent --json "$discord_output"
	echo
}

disk_usage_percent=`df -k / --output=pcent | tail -1 | rev | cut -c2-3 | rev`
if (( ${disk_usage_percent} > ${percent_warn} ))
then
	icon=fire
	display "**Disk usage (${disk_usage_percent// /}%) exceeds alert threshold of ${percent_warn}%**"
else
	display "**Working** Disk usage (${disk_usage_percent// /}%)"
fi

exit 0

