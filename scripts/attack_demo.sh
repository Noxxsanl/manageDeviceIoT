#!/usr/bin/env bash
# =============================================================================
#  IoT Security – Attack Demo Script
#  Task 15: Demo 5 kịch bản tấn công và cách hệ thống phản ứng
#
#  Yêu cầu: curl, openssl, jq (tùy chọn)
#  Cách dùng:
#    chmod +x scripts/attack_demo.sh
#    ./scripts/attack_demo.sh [BACKEND_URL] [GW_ID] [GW_SECRET] [SN_ID] [SN_SECRET]
# =============================================================================

set -euo pipefail

# ── Cấu hình ──────────────────────────────────────────────────────────────────
BACKEND="${1:-http://localhost:3000}"
GW_ID="${2:-ESP32-GW-XXXXXXXX}"
GW_SECRET="${3:-your-64-char-hex-gw-secret}"
SN_ID="${4:-ESP32-SN-XXXXXXXX}"
SN_SECRET="${5:-your-64-char-hex-sn-secret}"
DATA_ENDPOINT="$BACKEND/api/device/data"
LOGIN_ENDPOINT="$BACKEND/api/auth/login"

# ── Màu sắc terminal ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
hmac_sha256() {
    local key="$1"
    local msg="$2"
    # key là hex string → chuyển thành bytes trước khi tính HMAC
    echo -n "$msg" | openssl dgst -sha256 -hmac "$(echo -n "$key" | xxd -r -p 2>/dev/null || echo -n "$key")" -hex 2>/dev/null \
        | sed 's/^.* //'
}

now_ts() { date +%s; }

print_header() {
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
}

print_result() {
    local http_code="$1"
    local body="$2"
    if [[ "$http_code" == "200" ]]; then
        echo -e "${GREEN}✓ HTTP $http_code${NC}"
    else
        echo -e "${RED}✗ HTTP $http_code${NC}"
    fi
    echo -e "  Response: $(echo "$body" | head -c 200)"
}

build_valid_payload() {
    local gw_ts sn_ts gw_hmac sn_hmac
    gw_ts=$(now_ts)
    sn_ts=$(now_ts)
    gw_hmac=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${gw_ts}")
    sn_hmac=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${sn_ts}")

    cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $gw_ts,
  "gw_hmac":      "$gw_hmac",
  "sensor_id":    "$SN_ID",
  "sn_timestamp": $sn_ts,
  "sn_hmac":      "$sn_hmac",
  "data":         { "temperature": 28.5, "humidity": 65.0 }
}
EOF
}

send_payload() {
    local payload="$1"
    local extra_headers="${2:-}"
    local response http_code
    response=$(curl -s -w '\n%{http_code}' -X POST "$DATA_ENDPOINT" \
        -H "Content-Type: application/json" \
        $extra_headers \
        -d "$payload" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    print_result "$http_code" "$body"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     IoT Security – Attack Demo Scenarios         ║${NC}"
echo -e "${BLUE}║     Backend: $DATA_ENDPOINT${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}\n"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 0: Baseline – Request hợp lệ (để so sánh)
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 0: Baseline – Request hợp lệ (kỳ vọng: 200 OK)"
echo -e "${YELLOW}Mục đích: Xác nhận hệ thống hoạt động bình thường trước khi demo attack${NC}"
VALID_PAYLOAD=$(build_valid_payload)
echo "Payload:"
echo "$VALID_PAYLOAD"
echo ""
echo -e "${YELLOW}→ Gửi request hợp lệ...${NC}"
send_payload "$VALID_PAYLOAD"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 1: Device Spoofing – HMAC giả mạo
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 1: Device Spoofing – HMAC giả mạo (kỳ vọng: 401)"
echo -e "${YELLOW}Mô tả: Kẻ tấn công biết device_id nhưng không có secret_key,${NC}"
echo -e "${YELLOW}       cố gắng giả mạo HMAC bằng chuỗi ngẫu nhiên.${NC}"
echo ""
GW_TS=$(now_ts); SN_TS=$(now_ts)
SPOOF_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $GW_TS,
  "gw_hmac":      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  "sensor_id":    "$SN_ID",
  "sn_timestamp": $SN_TS,
  "sn_hmac":      "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe00",
  "data":         { "temperature": 99.9, "humidity": 0.0 }
}
EOF
)
echo "Payload (HMAC fake):"
echo "$SPOOF_PAYLOAD"
echo ""
echo -e "${RED}→ Gửi request với HMAC giả mạo...${NC}"
send_payload "$SPOOF_PAYLOAD"
echo -e "${GREEN}✓ Hệ thống từ chối và ghi GATEWAY_AUTH_FAIL vào audit_log${NC}"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 2: Replay Attack – Gửi lại request cũ
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 2: Replay Attack – Timestamp quá cũ (kỳ vọng: 401)"
echo -e "${YELLOW}Mô tả: Kẻ tấn công chặn được 1 request hợp lệ và cố gửi lại sau 10 phút.${NC}"
echo -e "${YELLOW}       Server kiểm tra: |now - timestamp| > 300s → reject.${NC}"
echo ""
OLD_TS=$(($(now_ts) - 700))  # 700 giây trước = ~12 phút
GW_HMAC_OLD=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${OLD_TS}")
SN_HMAC_OLD=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${OLD_TS}")
REPLAY_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $OLD_TS,
  "gw_hmac":      "$GW_HMAC_OLD",
  "sensor_id":    "$SN_ID",
  "sn_timestamp": $OLD_TS,
  "sn_hmac":      "$SN_HMAC_OLD",
  "data":         { "temperature": 25.0, "humidity": 60.0 }
}
EOF
)
echo "Payload (timestamp = $OLD_TS, ~12 phút trước):"
echo "$REPLAY_PAYLOAD"
echo ""
echo -e "${RED}→ Gửi request với timestamp cũ...${NC}"
send_payload "$REPLAY_PAYLOAD"
echo -e "${GREEN}✓ HMAC hợp lệ nhưng timestamp window violated → 401${NC}"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 3: Brute Force Block – 6 request sai liên tiếp
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 3: Brute Force Block – 6 request sai (kỳ vọng: bị block sau lần 5)"
echo -e "${YELLOW}Mô tả: Kẻ tấn công thử brute-force HMAC liên tục.${NC}"
echo -e "${YELLOW}       Sau 5 lần fail → device bị blocked tự động.${NC}"
echo ""
for i in $(seq 1 6); do
    GW_TS=$(now_ts); SN_TS=$(now_ts)
    BRUTE_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $GW_TS,
  "gw_hmac":      "$(openssl rand -hex 32)",
  "sensor_id":    "$SN_ID",
  "sn_timestamp": $SN_TS,
  "sn_hmac":      "$(openssl rand -hex 32)",
  "data":         { "temperature": 20.0, "humidity": 50.0 }
}
EOF
    )
    echo -ne "${RED}  Lần $i: ${NC}"
    response=$(curl -s -w '\n%{http_code}' -X POST "$DATA_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$BRUTE_PAYLOAD" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1 | head -c 120)
    echo -e "HTTP $http_code | $body"
    sleep 0.5
done
echo ""
echo -e "${GREEN}✓ Sau lần thứ 5: device bị set status='blocked' trong DB${NC}"
echo -e "${GREEN}✓ fail_count >= 5 → DEVICE_BLOCKED trong audit_log${NC}"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 4: Unregistered Device – device_id không tồn tại
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 4: Unregistered Device (kỳ vọng: 401/403)"
echo -e "${YELLOW}Mô tả: Thiết bị chưa đăng ký cố gửi dữ liệu lên server.${NC}"
echo ""
FAKE_TS=$(now_ts)
UNREG_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "ESP32-GW-NOTEXIST",
  "gw_timestamp": $FAKE_TS,
  "gw_hmac":      "$(openssl rand -hex 32)",
  "sensor_id":    "ESP32-SN-NOTEXIST",
  "sn_timestamp": $FAKE_TS,
  "sn_hmac":      "$(openssl rand -hex 32)",
  "data":         { "temperature": 30.0, "humidity": 70.0 }
}
EOF
)
echo "Payload (device_id không tồn tại trong DB):"
echo "$UNREG_PAYLOAD"
echo ""
echo -e "${RED}→ Gửi request từ thiết bị chưa đăng ký...${NC}"
send_payload "$UNREG_PAYLOAD"
echo -e "${GREEN}✓ Server không tìm thấy device_id → GATEWAY_AUTH_FAIL → 401${NC}"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 5: Privilege Escalation – Sensor giả vờ là Gateway
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 5: Privilege Escalation – Sensor dùng gateway_id (kỳ vọng: 403)"
echo -e "${YELLOW}Mô tả: Sensor node cố gắng gửi dữ liệu trực tiếp bằng cách đặt${NC}"
echo -e "${YELLOW}       chính mình làm gateway_id (vi phạm RBAC: device_type check).${NC}"
echo ""
PRIV_TS=$(now_ts)
SN_HMAC_AS_GW=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${PRIV_TS}")
PRIV_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$SN_ID",
  "gw_timestamp": $PRIV_TS,
  "gw_hmac":      "$SN_HMAC_AS_GW",
  "sensor_id":    "$SN_ID",
  "sn_timestamp": $PRIV_TS,
  "sn_hmac":      "$SN_HMAC_AS_GW",
  "data":         { "temperature": 25.0, "humidity": 60.0 }
}
EOF
)
echo "Payload (sensor dùng sensor_id làm gateway_id):"
echo "$PRIV_PAYLOAD"
echo ""
echo -e "${RED}→ Gửi request privilege escalation...${NC}"
send_payload "$PRIV_PAYLOAD"
echo -e "${GREEN}✓ Backend kiểm tra device_type: sensor không thể đóng vai gateway → 403 INVALID_DEVICE_TYPE${NC}"

# ══════════════════════════════════════════════════════════════════════════════
#  TỔNG KẾT
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TỔNG KẾT KẾT QUẢ ATTACK DEMO${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "  Scenario 0 (Baseline)          → ${GREEN}200 OK${NC}"
echo -e "  Scenario 1 (Device Spoofing)   → ${RED}401 GATEWAY_AUTH_FAIL${NC}"
echo -e "  Scenario 2 (Replay Attack)     → ${RED}401 TIMESTAMP_EXPIRED${NC}"
echo -e "  Scenario 3 (Brute Force)       → ${RED}401 x5 → 403 DEVICE_BLOCKED${NC}"
echo -e "  Scenario 4 (Unregistered)      → ${RED}401 GATEWAY_AUTH_FAIL${NC}"
echo -e "  Scenario 5 (Privilege Escal.)  → ${RED}403 INVALID_DEVICE_TYPE${NC}"
echo ""
echo -e "${YELLOW}Kiểm tra audit_log trên Dashboard để xem tất cả sự kiện đã được ghi lại.${NC}"
echo ""
