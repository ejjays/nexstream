#!/bin/bash

cd "$(dirname "$0")/.."

# sonar-scanner for termux
PK="ejjays_nexstream"
ORG="ejjays"
VER="6.2.1.4610"
SDIR="$HOME/.sonar/scanner"

[ -z "$SONAR_TOKEN" ] && echo "error: need SONAR_TOKEN env" && exit 1

# setup deps
command -v java >/dev/null || pkg install -y openjdk-17

if [ ! -d "$SDIR" ]; then
    mkdir -p "$HOME/.sonar"
    curl -LO "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$VER.zip"
    unzip -q sonar-scanner-cli-$VER.zip && mv sonar-scanner-$VER "$SDIR"
    rm sonar-scanner-cli-$VER.zip
fi

export SONAR_SCANNER_OPTS="-Dsonar.java.jdkHome=$PREFIX"

echo "analyzing codebase..."
"$SDIR/bin/sonar-scanner" \
  -Dsonar.projectKey=$PK \
  -Dsonar.organization=$ORG \
  -Dsonar.sources=. \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.token=$SONAR_TOKEN \
  -Dsonar.scanner.skipJreProvisioning=true \
  -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
  -Dsonar.exclusions="node_modules/**,dist/**,frontend/dist/**,backend/dist/**,frontend/public/libav/**,**/*.min.js,backend/tests/**,scripts/**"

echo "done."
