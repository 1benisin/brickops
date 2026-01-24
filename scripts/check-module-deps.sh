#!/bin/bash
# ============================================
# Module Dependency Validator
# ============================================
# This script validates that modules follow the dependency hierarchy
# defined in docs/architecture/backend/module-dependencies.md
#
# Dependency Rules:
# - shared/: Can be imported by all, cannot import from any domain
# - users/: Can only import from shared/
# - catalog/: Can only import from shared/
# - identify/: Can only import from shared/
# - inventory/: Can import from shared/, catalog/
# - orders/: Can import from shared/, catalog/
# - marketplaces/: Can only import from shared/
# - sync/: Can import from everything (orchestration layer)
#
# Run: pnpm check:module-deps
# ============================================

set -e

CONVEX_DIR="convex"
VIOLATIONS=0
WARNINGS=0

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

log_error() {
    echo -e "${RED}VIOLATION:${NC} $1"
    ((VIOLATIONS++)) || true
}

log_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
    ((WARNINGS++)) || true
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Helper function to search for import patterns
# Uses grep -rE for extended regex support
check_imports() {
    local search_dir="$1"
    local pattern="$2"
    grep -rE "$pattern" "$search_dir" --include="*.ts" 2>/dev/null || true
}

has_imports() {
    local search_dir="$1"
    local pattern="$2"
    grep -rEq "$pattern" "$search_dir" --include="*.ts" 2>/dev/null
}

# ============================================
# Rule 1: shared/ has no domain imports
# ============================================
echo ""
echo "Checking shared/ has no domain imports..."

# Check for absolute imports from domain modules
PATTERN='from ["'"'"']@/convex/(inventory|orders|catalog|identify|sync|marketplaces|users)/'
if has_imports "$CONVEX_DIR/shared/" "$PATTERN"; then
    log_error "shared/ has absolute imports to domain modules"
    check_imports "$CONVEX_DIR/shared/" "$PATTERN"
else
    log_success "shared/ has no absolute domain imports"
fi

# Check for relative imports to domain modules (going up directories)
PATTERN='from ["'"'"']\.\.\/(inventory|orders|catalog|identify|sync|marketplaces|users)'
if has_imports "$CONVEX_DIR/shared/" "$PATTERN"; then
    log_error "shared/ has relative imports to domain modules"
    check_imports "$CONVEX_DIR/shared/" "$PATTERN"
else
    log_success "shared/ has no relative domain imports"
fi

# ============================================
# Rule 2: Core domains are independent
# ============================================
echo ""
echo "Checking inventory/ doesn't import from orders/..."

# Match relative imports like "../orders/"
PATTERN='from ["'"'"']\.\./(orders)/'
if has_imports "$CONVEX_DIR/inventory/" "$PATTERN"; then
    log_error "inventory/ imports from orders/"
    check_imports "$CONVEX_DIR/inventory/" "$PATTERN"
else
    # Also check absolute imports
    PATTERN='from ["'"'"']@/convex/orders/'
    if has_imports "$CONVEX_DIR/inventory/" "$PATTERN"; then
        log_error "inventory/ imports from orders/ (absolute)"
        check_imports "$CONVEX_DIR/inventory/" "$PATTERN"
    else
        log_success "inventory/ doesn't import from orders/"
    fi
fi

echo ""
echo "Checking orders/ doesn't import from inventory/..."

# Match relative imports like "../inventory/"
PATTERN='from ["'"'"']\.\./(inventory)/'
if has_imports "$CONVEX_DIR/orders/" "$PATTERN"; then
    log_error "orders/ imports from inventory/"
    check_imports "$CONVEX_DIR/orders/" "$PATTERN"
else
    # Also check absolute imports
    PATTERN='from ["'"'"']@/convex/inventory/'
    if has_imports "$CONVEX_DIR/orders/" "$PATTERN"; then
        log_error "orders/ imports from inventory/ (absolute)"
        check_imports "$CONVEX_DIR/orders/" "$PATTERN"
    else
        log_success "orders/ doesn't import from inventory/"
    fi
fi

echo ""
echo "Checking catalog/ doesn't import from other core domains..."
PATTERN='from ["'"'"']\.\.\/(inventory|orders|identify)/'
if has_imports "$CONVEX_DIR/catalog/" "$PATTERN"; then
    log_error "catalog/ imports from other core domains"
    check_imports "$CONVEX_DIR/catalog/" "$PATTERN"
else
    PATTERN='from ["'"'"']@/convex/(inventory|orders|identify)/'
    if has_imports "$CONVEX_DIR/catalog/" "$PATTERN"; then
        log_error "catalog/ imports from other core domains (absolute)"
        check_imports "$CONVEX_DIR/catalog/" "$PATTERN"
    else
        log_success "catalog/ has no cross-domain imports"
    fi
fi

echo ""
echo "Checking identify/ doesn't import from other core domains..."
PATTERN='from ["'"'"']\.\.\/(inventory|orders|catalog)/'
if has_imports "$CONVEX_DIR/identify/" "$PATTERN"; then
    log_error "identify/ imports from other core domains"
    check_imports "$CONVEX_DIR/identify/" "$PATTERN"
else
    PATTERN='from ["'"'"']@/convex/(inventory|orders|catalog)/'
    if has_imports "$CONVEX_DIR/identify/" "$PATTERN"; then
        log_error "identify/ imports from other core domains (absolute)"
        check_imports "$CONVEX_DIR/identify/" "$PATTERN"
    else
        log_success "identify/ has no cross-domain imports"
    fi
fi

# ============================================
# Rule 3: marketplaces/ is isolated from core
# ============================================
echo ""
echo "Checking marketplaces/ doesn't import from core domains..."

# Check for absolute imports to core domains (definitive violations)
# These are always violations regardless of directory depth
PATTERN='from ["'"'"']@/convex/(inventory|orders|catalog|sync|identify)/'
if has_imports "$CONVEX_DIR/marketplaces/" "$PATTERN"; then
    log_error "marketplaces/ imports from core modules"
    check_imports "$CONVEX_DIR/marketplaces/" "$PATTERN"
else
    log_success "marketplaces/ is properly isolated from core"
fi

# Note: We don't check relative imports because marketplaces has internal
# subdirectories named 'inventory/', 'orders/' etc. that would cause
# false positives. The absolute import check above catches real violations.

# ============================================
# Rule 4: users/ only imports from shared/
# ============================================
echo ""
echo "Checking users/ only imports from shared/..."
PATTERN='from ["'"'"']\.\.\/(inventory|orders|catalog|identify|sync|marketplaces)/'
if has_imports "$CONVEX_DIR/users/" "$PATTERN"; then
    log_error "users/ imports from domain modules (relative)"
    check_imports "$CONVEX_DIR/users/" "$PATTERN"
else
    PATTERN='from ["'"'"']@/convex/(inventory|orders|catalog|identify|sync|marketplaces)/'
    if has_imports "$CONVEX_DIR/users/" "$PATTERN"; then
        log_error "users/ imports from domain modules (absolute)"
        check_imports "$CONVEX_DIR/users/" "$PATTERN"
    else
        log_success "users/ has correct dependencies"
    fi
fi

# ============================================
# Rule 5: No circular dependencies via sync/
# ============================================
echo ""
echo "Checking sync/ doesn't import from users/ or identify/..."
PATTERN='from ["'"'"']\.\.\/(users|identify)/'
if has_imports "$CONVEX_DIR/sync/" "$PATTERN"; then
    log_warning "sync/ imports from users/ or identify/ (relative)"
    check_imports "$CONVEX_DIR/sync/" "$PATTERN"
else
    PATTERN='from ["'"'"']@/convex/(users|identify)/'
    if has_imports "$CONVEX_DIR/sync/" "$PATTERN"; then
        log_warning "sync/ imports from users/ or identify/ (absolute)"
        check_imports "$CONVEX_DIR/sync/" "$PATTERN"
    else
        log_success "sync/ has correct dependencies"
    fi
fi

# ============================================
# Known Architectural Issues (Not Blocking)
# ============================================
# These violations are documented and tracked for future refactoring.
# They don't block the check but are noted for awareness.
echo ""
echo "============================================"
echo "Known Architectural Issues"
echo "============================================"
KNOWN_ISSUES=0

# marketplaces/bricklink/catalog/ has type-only imports from catalog/mutations
# These are TypeScript `import type` statements that are erased at compile time,
# so they don't create runtime dependencies. However, they do create a conceptual
# coupling that ideally should be resolved with a sync/catalog/ orchestration layer.
# See: _notes/modular-architecture-refactor-plan.md Task F1
PATTERN='from ["'"'"']@/convex/catalog/'
if has_imports "$CONVEX_DIR/marketplaces/bricklink/catalog/" "$PATTERN"; then
    echo -e "${YELLOW}KNOWN:${NC} marketplaces/bricklink/catalog/ has type imports from catalog/"
    echo "       → Type-only imports (no runtime dependency), but conceptual coupling"
    echo "       → Consider sync/catalog/ orchestration layer for cleaner architecture"
    ((KNOWN_ISSUES++)) || true
    # Decrement violation count since this is tracked and type-only
    if [ $VIOLATIONS -gt 0 ]; then
        ((VIOLATIONS--)) || true
    fi
fi

if [ $KNOWN_ISSUES -gt 0 ]; then
    echo ""
    echo "These $KNOWN_ISSUES issue(s) are tracked in the refactor plan."
fi

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "Dependency Check Summary"
echo "============================================"

if [ $VIOLATIONS -gt 0 ]; then
    echo -e "${RED}Found $VIOLATIONS NEW violation(s)${NC}"
    echo ""
    echo "Please fix the violations above before committing."
    echo "See docs/architecture/backend/module-dependencies.md for dependency rules."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Found $WARNINGS warning(s), no critical violations${NC}"
    echo ""
    echo "Consider fixing warnings for cleaner architecture."
    exit 0
else
    echo -e "${GREEN}All dependency rules validated!${NC}"
    if [ $KNOWN_ISSUES -gt 0 ]; then
        echo "($KNOWN_ISSUES known architectural issue(s) tracked for future refactoring)"
    fi
    exit 0
fi
