##
## Endpoints check: curl to discord
##
## Usage: ./scriptname.sh environment host:port
## ENV has: discord_url
## Performs checks on:
##  - / (expect 200, and "<h3 class=\"cent\">Log In</h3>" )
##  - /api/v1/Ping (expect 200 and "\"service_name\": \"__TEMPLATE_PROJ_TAG__-api-server\"," )
##

if [ -z "$discord_url" ]; then
	echo "Missing ENV discord_url"
	exit 101
fi

if [ -z "$1" ]; then
	echo "Usage: ${0} environment [ protocol://WEBhost:port [ protocol://APIhost:port ]]"
	exit 103
fi

## Variables
icon=fire
environment=$1
web_host=${2:-https://${environment,,}.__TEMPLATE_DOMAIN__}
api_host=${3:-https://${environment,,}-api.__TEMPLATE_DOMAIN__}
expected_host=${environment,,}-api.__TEMPLATE_DOMAIN__
if [ "$api_host" == "https://prod-api.__TEMPLATE_DOMAIN__" ]; then
	api_host=https://api.__TEMPLATE_DOMAIN__
	expected_host=api.__TEMPLATE_DOMAIN__
fi
script_name=$(basename $0)
silent=${silent:---silent}

# Create a marker for the output log file
echo == `date` == $0 $environment $web_host $api_host

## Utility
#set -e
function discordEscape () {
    local s
    s=${1//&/&amp;}
    s=${s//</&lt;}
    s=${s//>/&gt;}
    s=${s//'"'/\\\"}
    echo "$s"
}
function display () {
	discord_output="{\"content\":\":${icon}: **[${environment}](${host}${1})** *[bastion ${script_name}]* $2\"}"
	echo "$discord_output"
	curl $discord_url $silent --json @- <<< "$discord_output"
	echo
}

## Run the code, look for errors
run () {
	endpoint="$1"
	# Validate that we can reach the host/endpoint
	code=$(curl --write-out '%{http_code}' $silent --output /dev/null ${host}${endpoint})
	curl_error=$?
	if [ "$curl_error" != "0" ]; then
		display "$endpoint" "*Curl* failed: *$curl_error*"
		return 110
	fi

	if [ "$code" != '200' ]; then
		display "$endpoint" "*$(discordEscape "$endpoint")* failed: *${code}*"
		return 111;
	fi
	# Get some content to check
	expect=$2
	content=$(curl $silent ${host}${endpoint})
	#echo content: $content
	if [[ ! "$content" =~ "$expect" ]]; then
		expect_escaped=$(echo $expect | tr "<>" "..")
		display "$endpoint" "*$(discordEscape "$endpoint")* missing:\n\t\t$(discordEscape "$expect")"
		return 112;
	fi
	echo Code for $endpoint is: $code
}

# We do not run browser, so just the static index.html is returned.

#host=$web_host run /#!/login "<title>__TEMPLATE_PROJ_NAME__ payments</title>"
host=$api_host run /api/v1/Ping "\"host\":\"${expected_host}\","

exit 0 # TODO consider return values of 'run'

