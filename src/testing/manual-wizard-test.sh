#!/bin/bash

# Manual wizard test script
# Tests the wizard flow step by step

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         CTX Wizard Manual Verification Tests                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "Test 1: Wizard launches and shows welcome"
echo "-------------------------------------------"
timeout 2 node scripts/ctx-wizard.js --dry-run <<EOF > /tmp/test1.log 2>&1
n
EOF

if grep -q "Welcome to CTX Setup Wizard" /tmp/test1.log; then
  echo "✓ Welcome message appears"
else
  echo "✗ Welcome message missing"
fi

if grep -q "DRY RUN MODE" /tmp/test1.log; then
  echo "✓ Dry-run mode activated"
else
  echo "✗ Dry-run mode not activated"
fi

echo ""
echo "Test 2: Provider detection"
echo "-------------------------------------------"
if grep -q "Provider Detection Results" /tmp/test1.log; then
  echo "✓ Provider detection runs"
else
  echo "✗ Provider detection failed"
fi

if grep -q "Claude Code\|Codex CLI\|Gemini CLI\|OpenCode" /tmp/test1.log; then
  echo "✓ Providers detected"
else
  echo "✗ No providers detected"
fi

echo ""
echo "Test 3: Provider configuration flow"
echo "-------------------------------------------"
timeout 5 node scripts/ctx-wizard.js --dry-run <<EOF > /tmp/test3.log 2>&1
y
0
n
n
EOF

if grep -q "Available providers" /tmp/test3.log; then
  echo "✓ Provider list shown"
else
  echo "✗ Provider list not shown"
fi

if grep -q "\[DRY RUN\] Would configure" /tmp/test3.log; then
  echo "✓ Configuration attempted"
else
  echo "✗ Configuration not attempted"
  echo "Debug output:"
  tail -20 /tmp/test3.log
fi

if grep -q "Setup complete" /tmp/test3.log; then
  echo "✓ Setup completion shown"
else
  echo "✗ Setup completion not shown"
fi

if grep -q "Would you like to run the interactive tutorial?" /tmp/test3.log; then
  echo "✓ Tutorial prompt appears"
else
  echo "✗ Tutorial prompt missing"
fi

echo ""
echo "Test 4: Help text integration"
echo "-------------------------------------------"
if node scripts/ctx-setup.js --help 2>&1 | grep -q "interactive\|wizard"; then
  echo "✓ ctx-setup.js mentions wizard mode"
else
  echo "✗ ctx-setup.js doesn't mention wizard"
fi

echo ""
echo "Test 5: --interactive flag"
echo "-------------------------------------------"
timeout 2 node scripts/ctx-setup.js --interactive <<EOF > /tmp/test5.log 2>&1
n
EOF

if grep -q "Welcome to CTX Setup Wizard" /tmp/test5.log; then
  echo "✓ --interactive launches wizard"
else
  echo "✗ --interactive doesn't launch wizard"
fi

echo ""
echo "Test 6: Module imports work"
echo "-------------------------------------------"
if node -e "import('./scripts/setup/provider-detector.js').then(() => console.log('OK'))" 2>&1 | grep -q "OK"; then
  echo "✓ provider-detector.js imports"
else
  echo "✗ provider-detector.js import failed"
fi

if node -e "import('./scripts/setup/config-validator.js').then(() => console.log('OK'))" 2>&1 | grep -q "OK"; then
  echo "✓ config-validator.js imports"
else
  echo "✗ config-validator.js import failed"
fi

if node -e "import('./scripts/setup/state-manager.js').then(() => console.log('OK'))" 2>&1 | grep -q "OK"; then
  echo "✓ state-manager.js imports"
else
  echo "✗ state-manager.js import failed"
fi

if node -e "import('./scripts/setup/tutorial.js').then(() => console.log('OK'))" 2>&1 | grep -q "OK"; then
  echo "✓ tutorial.js imports"
else
  echo "✗ tutorial.js import failed"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Manual verification complete!"
echo ""
echo "For full interactive testing:"
echo "  1. Run: node scripts/ctx-setup.js --interactive"
echo "  2. Follow prompts to configure a provider"
echo "  3. Accept tutorial offer"
echo "  4. Interrupt with Ctrl+C and restart to test resume"
echo ""
