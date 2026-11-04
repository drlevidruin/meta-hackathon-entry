#!/bin/zsh
# Brings the live station back if it is not running, for example after a reboot.
# It starts only what is missing and never stops a running process.
# launchd runs it every two minutes (org.pardes.kriah-station-keepalive).
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd "${0:A:h}/.." || exit 1
mkdir -p .lab
stamp() { date '+%Y-%m-%d %H:%M:%S'; }
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

if ! listening 8791; then
  echo "$(stamp) phoneme service down, starting" >> .lab/keep-alive.log
  nohup npm run phonemes >> .lab/phonemes.log 2>&1 &
  for i in {1..36}; do listening 8791 && break; sleep 5; done
fi

if ! listening 8787; then
  echo "$(stamp) server down, starting" >> .lab/keep-alive.log
  nohup npm start >> .lab/station.log 2>&1 &
  sleep 8
  listening 8787 && echo "$(stamp) server up" >> .lab/keep-alive.log \
    || echo "$(stamp) server did not come up, see .lab/station.log" >> .lab/keep-alive.log
fi
