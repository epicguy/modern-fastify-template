##
## Health check: curl to discord
##
## Usage: ./scriptname.sh environment host:port seconds-per-epoch
## ENV has: discord_url
##

# Create a marker for the output log file
echo == `date` == $0 $1 $2 $3

if [ -z "$discord_url" ]; then
	echo "Missing ENV discord_url"
	exit 101
fi

if [ -z "$cred" ]; then
	echo "Missing ENV cred"
	exit 102
fi

if [ -z "$3" ]; then
	echo "Usage: ${0} environment protocol://host:port seconds-per-epoch"
	exit 103
fi

## Variables
icon=fire
basic_header=Authorization:\ Basic\ $cred
urlx=/api/v1/Health\?type=comprehensive\&epoch_secs=${3}\&endpoint_baselines=post/Ident/_create,12\;post/User/_create,6\;post/User/_purchase,80
url=${urlx}\&output=discord
#urlx=/api/v1/Health\?type=comprehensive\&epoch_secs=${3}
environment=$1
host=$2
script_name=$( echo $0 | cut -d/ -f5)
silent=${silent:---silent}

## Utiltiy
#set -e
display () {
	discord_output="{\"content\":\":${icon}: **[${environment}](${host}${urlx})** *[bastion ${script_name}]* $1\"}"
	echo "$discord_output"
	curl $discord_url $silent --json @- <<< "$discord_output"
	echo
}

## Run the code, look for errors
code=$(curl --write-out '%{http_code}' $silent --output /dev/null ${host}${url} -H "$basic_header")
curl_error=$?
if [ "$curl_error" != "0" ]; then
	display "*Curl* failed: *$curl_error*"
	exit 110
fi

if [ "$code" != '200' ]; then
	display "*Health Check* failed: *${code}*"
	exit 111;
fi
echo Code is: $code
exit 0

