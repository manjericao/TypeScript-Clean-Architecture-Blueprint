#!/bin/bash

# Check if environment parameter is provided
if [ -z "$1" ]; then
    echo "Usage: ./run-all.sh <environment>"
    echo "Available environments: dev, staging, production"
    exit 1
fi

ENV=$1
CONFIG_PATH="tests/artillery/config/environments.yaml"
SCENARIOS_DIR="tests/artillery/scenarios"

# Array of scenarios to run
SCENARIOS=(
    "auth/login.yaml"
    "auth/register.yaml"
    "user/user-operations.yaml"
)

# Run each scenario
for scenario in "${SCENARIOS[@]}"; do
    echo "Running scenario: $scenario in $ENV environment"
    artillery run "$SCENARIOS_DIR/$scenario" --config "$CONFIG_PATH" -e "$ENV"

    # Check if the scenario failed
    if [ $? -ne 0 ]; then
        echo "❌ Scenario $scenario failed"
        exit 1
    fi

    echo "✅ Scenario $scenario completed"
    echo "-----------------------------------"
done

echo "🎉 All scenarios completed successfully!"
