# Lưu Đồ Thuật Toán Firmware — IoT Manager

> Đọc theo thứ tự: **Tổng quan → Sensor Node → Gateway Node → Dùng chung → End-to-End → Bảo mật**

---

## I. TỔNG QUAN HỆ THỐNG

### I.1 Kiến Trúc & Luồng Dữ Liệu

```mermaid
flowchart LR
    DHT22["🌡️ DHT22\nSensor"]
    SN["⚡ Sensor Node\nESP32 DOIT v1"]
    BROKER["📡 MQTT Broker\nMosquitto"]
    GW["🔀 Gateway Node\nESP32-S3 N16R8"]
    BE["⚙️ Backend API\nExpress.js :5000"]
    DB["🗄️ Database\nPostgreSQL"]
    FE["📊 Dashboard\nNext.js :3000"]

    DHT22 -->|"GPIO4 · I2C"| SN
    SN -->|"MQTT Publish\nJSON + HMAC-SHA256\ntopic: local/sensors/+/data"| BROKER
    BROKER -->|"MQTT Subscribe\nwildcard: +/data"| GW
    GW -->|"Validate → Re-sign\nHTTP POST /api/device/data"| BE
    BE --> DB --> FE
```

### I.2 Sơ Đồ Toàn Hệ Thống — Full Stack (Frontend → Backend → DB → Firmware)

```mermaid
flowchart TB
    subgraph UI_LAYER ["🖥️ Lớp Giao Diện"]
        USER["👤 Người dùng\n(Trình duyệt)"]
        FE["📊 Frontend Dashboard\nNext.js · :3000"]
        USER -- "HTTP/HTTPS" --> FE
    end

    subgraph BE_LAYER ["⚙️ Lớp Backend"]
        API["🔧 REST API\nExpress.js · :5000\n/api/devices\n/api/device/data\n/api/sensor-data"]
    end

    subgraph DB_LAYER ["🗄️ Lớp Dữ Liệu"]
        DB[("🗄️ PostgreSQL\nDevices · SensorData\nGateways · Users")]
    end

    subgraph MSG_LAYER ["📡 Lớp Giao Tiếp"]
        MQTT["📡 MQTT Broker\nMosquitto · :1883\ntopic: local/sensors/+/data"]
    end

    subgraph FW_LAYER ["🔌 Lớp Firmware — ESP32"]
        GW["🔀 Gateway Node\nESP32-S3 N16R8\nValidate + Re-sign"]
        SN["⚡ Sensor Node\nESP32 DOIT v1\nĐọc cảm biến + Ký HMAC"]
    end

    subgraph HW_LAYER ["🌡️ Lớp Vật Lý"]
        DHT["🌡️ DHT22\nNhiệt độ · Độ ẩm"]
    end

    FE     -- "GET /api/sensor-data\nGET /api/devices"        --> API
    API    -- "JSON response"                                  --> FE
    API   <-- "SQL Query / INSERT"                            --> DB
    GW     -- "HTTP POST /api/device/data\n{gw_hmac, sn_hmac, data}" --> API
    SN     -- "MQTT Publish\nJSON + HMAC-SHA256"              --> MQTT
    MQTT   -- "Subscribe · wildcard"                          --> GW
    DHT    -- "GPIO4 · đọc mỗi 5s"                           --> SN
```

---

### I.3 Phân Chia Trách Nhiệm

```mermaid
flowchart TD
    subgraph SN_BOX ["⚡ SENSOR NODE (ESP32 DOIT v1)"]
        direction TB
        S1["① Đọc DHT22\n(nhiệt độ, độ ẩm)"]
        S2["② Lấy timestamp NTP"]
        S3["③ Ký HMAC-SHA256"]
        S4["④ Publish MQTT"]
        S1 --> S2 --> S3 --> S4
    end

    subgraph GW_BOX ["🔀 GATEWAY NODE (ESP32-S3 N16R8)"]
        direction TB
        G1["① Subscribe MQTT"]
        G2["② Validate: Whitelist + Timestamp + HMAC"]
        G3["③ Re-sign Gateway HMAC"]
        G4["④ HTTP POST → Backend"]
        G1 --> G2 --> G3 --> G4
    end

    S4 -->|"MQTT Broker"| G1
```

---

## II. SENSOR NODE (ESP32 DOIT v1)

### II.1 Khởi Động — setup()

```mermaid
flowchart TD
    START(["🔌 Power On"])
    A["Serial.begin(115200)"]
    B["wifiSetup()\nKết nối WiFi · Timeout 20s"]
    C{WiFi OK?}
    D["ntpSetup()\nSync pool.ntp.org · UTC+7\nRetry 20×500ms"]
    E{NTP OK?}
    F["sensorSetup()\nKhởi tạo DHT22 GPIO4\nWarmup 2s"]
    G["mqttSetup()\nCấu hình PubSubClient\nKết nối Broker"]
    DONE(["▶ loop()"])

    START --> A --> B --> C
    C -->|"✅ OK"| D
    C -->|"⏱ Timeout\n(tiếp tục)"| D
    D --> E
    E -->|"✅ OK"| F
    E -->|"❌ Fail\n(không gửi được)"| F
    F --> G --> DONE
```

### II.2 Vòng Lặp Chính — loop() · 5000ms

```mermaid
flowchart TD
    LOOP(["🔄 loop()"])
    M1["wifiMaintain()"]
    M2["mqttMaintain() + client.loop()"]
    CHK_T{"⏱ >= 5000ms\ntừ lần gửi trước?"}
    CHK_W{"📶 WiFi\nkết nối?"}
    CHK_N{"🕐 NTP\nđồng bộ?"}
    CHK_M{"📡 MQTT\nkết nối?"}
    READ["readSensor()\nDHT22 → temp, humidity"]
    CHK_V{"🌡️ !isnan(temp)\n&& !isnan(humidity)?"}
    PUB["mqttPublishSensorData(data)"]
    LED["💡 Blink LED GPIO2"]
    SKIP["📝 Log lý do bỏ qua"]
    UPD["lastSendTime = millis()"]
    WAIT(["⏳ next loop()"])

    LOOP --> M1 --> M2 --> CHK_T
    CHK_T -->|"Chưa đủ"| WAIT
    CHK_T -->|"Đủ rồi"| CHK_W
    CHK_W -->|"❌"| SKIP
    CHK_W -->|"✅"| CHK_N
    CHK_N -->|"❌"| SKIP
    CHK_N -->|"✅"| CHK_M
    CHK_M -->|"❌"| SKIP
    CHK_M -->|"✅"| READ --> CHK_V
    CHK_V -->|"❌ NaN"| SKIP
    CHK_V -->|"✅"| PUB --> LED --> UPD
    SKIP --> UPD --> WAIT --> LOOP
```

### II.3 Đóng Gói & Publish — mqttPublishSensorData()

```mermaid
flowchart TD
    IN["📥 SensorData { temp, humidity }\nDEVICE_ID · SECRET_KEY"]
    T["timestamp = getCurrentTimestamp()\n← Unix epoch UTC+7 từ NTP"]
    MSG["message = DEVICE_ID + ':' + timestamp\nVD: 'ESP32-SN-ABCD:1700000000'"]
    HMAC["computeHMAC(SECRET_KEY, message)\n→ HMAC-SHA256 (mbedTLS)\n→ 64-char lowercase hex"]
    JSON["Tạo JSON payload:\n{\n  sensor_id,\n  sn_timestamp,\n  sn_hmac,\n  data: { temperature, humidity }\n}"]
    PUB["PubSubClient.publish(\n  'local/sensors/DEVICE_ID/data',\n  payload\n)"]
    RES{Publish OK?}
    OK(["✅ return true"])
    FAIL(["❌ return false"])

    IN --> T --> MSG --> HMAC --> JSON --> PUB --> RES
    RES -->|"OK"| OK
    RES -->|"Lỗi"| FAIL
```

---

## III. GATEWAY NODE (ESP32-S3 N16R8)

### III.1 Khởi Động — setup()

```mermaid
flowchart TD
    START2(["🔌 Power On"])
    A2["Serial.begin(115200)"]
    B2["wifiSetup()\nKết nối WiFi · Reconnect 10s"]
    C2["ntpSetup()\nSync NTP · UTC+7"]
    D2["mqttClientSetup(onSensorMessage)\nĐăng ký callback\nSubscribe: 'local/sensors/+/data'"]
    DONE2(["▶ loop()"])

    START2 --> A2 --> B2 --> C2 --> D2 --> DONE2
```

### III.2 Vòng Lặp Chính — loop() · Event-driven

```mermaid
flowchart TD
    LOOP2(["🔄 loop()"])
    M3["wifiMaintain()"]
    M4["mqttClientMaintain()\nclient.loop() ← nhận messages"]
    LED_CHK{"💡 millis() >= _fwdLedOffAt\nvà LED đang BẬT?"}
    LED_OFF["digitalWrite(LED_FWD, LOW)\nTắt LED"]
    MSG_CHK{"📨 Có MQTT message?"}
    CB["→ onSensorMessage(\n    topic, payload, length\n   )"]
    WAIT2(["⏳ next loop()"])

    LOOP2 --> M3 --> M4 --> LED_CHK
    LED_CHK -->|"✅ Có"| LED_OFF --> MSG_CHK
    LED_CHK -->|"❌ Không"| MSG_CHK
    MSG_CHK -->|"✅ Có"| CB --> WAIT2 --> LOOP2
    MSG_CHK -->|"❌ Không"| WAIT2
```

### III.3 Xử Lý Message — onSensorMessage()

```mermaid
flowchart TD
    IN3["📨 topic, payload, length"]
    CHK_NTP{"🕐 NTP đã\nđồng bộ?"}
    DROP["⛔ Drop message\nLog: NTP not synced"]
    FWD["forwardSensorData(\n  topic, payload, length\n)"]
    RES3{Kết quả?}
    LED_ON["💡 LED_FWD = HIGH\n_fwdLedOffAt = millis()+100ms"]
    LOG_F["📝 Log: Forward failed"]
    END3(["✅ Kết thúc callback"])

    IN3 --> CHK_NTP
    CHK_NTP -->|"❌ Chưa"| DROP --> END3
    CHK_NTP -->|"✅ Đã"| FWD --> RES3
    RES3 -->|"true (HTTP 200)"| LED_ON --> END3
    RES3 -->|"false"| LOG_F --> END3
```

### III.4 Pipeline Validate & Forward — forwardSensorData()

```mermaid
flowchart TD
    FI["📥 topic · payload · length"]

    subgraph P1 ["① Parse JSON"]
        J1["deserializeJson(payload)\nTrích: sensor_id · sn_timestamp\nsn_hmac · data"]
        J2{"Parse OK?"}
        JE["❌ return false"]
    end

    subgraph P2 ["② Whitelist Check"]
        W1["findSensorSecret(sensor_id)\nDò KNOWN_SENSORS[]"]
        W2{"Tìm thấy\nsecret key?"}
        WE["❌ return false\n(Unknown sensor)"]
    end

    subgraph P3 ["③ Timestamp Window ±300s"]
        T1["now = getCurrentTimestamp()"]
        T2["diff = |now − sn_timestamp|"]
        T3{"diff <= 300s?"}
        TE["❌ return false\n(Replay / clock skew)"]
    end

    subgraph P4 ["④ Verify Sensor HMAC"]
        H1["expected = HMAC-SHA256(\n  sensor_secret,\n  'sensor_id:sn_timestamp'\n)"]
        H2{"safeEq64(\n  sn_hmac,\n  expected\n)?"}
        HE["❌ return false\n(HMAC mismatch)"]
    end

    subgraph P5 ["⑤ Gateway Sign & Forward"]
        G1["gw_ts = getCurrentTimestamp()\ngw_hmac = HMAC-SHA256(\n  GW_SECRET, 'gw_id:gw_ts'\n)"]
        G2["Build output JSON:\n{ gateway_id, gw_ts, gw_hmac,\n  sensor_id, sn_ts, sn_hmac,\n  data }"]
        G3["HTTP POST → BACKEND_URL\nTimeout: 10s"]
        G4{"HTTP 200?"}
        OK5(["✅ return true"])
        ERR5(["❌ return false"])
    end

    FI --> J1 --> J2
    J2 -->|"❌"| JE
    J2 -->|"✅"| W1 --> W2
    W2 -->|"❌"| WE
    W2 -->|"✅"| T1 --> T2 --> T3
    T3 -->|"❌ Quá 300s"| TE
    T3 -->|"✅ OK"| H1 --> H2
    H2 -->|"❌"| HE
    H2 -->|"✅"| G1 --> G2 --> G3 --> G4
    G4 -->|"✅ 200"| OK5
    G4 -->|"❌"| ERR5
```

---

## IV. DÙNG CHUNG — CẢ HAI NODE

### IV.1 HMAC-SHA256 — computeHMAC() (mbedTLS)

> Dùng ở cả **Sensor Node** (ký dữ liệu) và **Gateway Node** (verify + re-sign)

```mermaid
flowchart TD
    IN4["📥 key: 64-char hex\nmessage: plain text"]
    A4["mbedtls_md_init(&ctx)"]
    B4["mbedtls_md_info_from_type\n(MBEDTLS_MD_SHA256)"]
    C4["mbedtls_md_setup(&ctx, info, 1)\n← 1 = HMAC mode"]
    D4["mbedtls_md_hmac_starts\n(&ctx, key.bytes, key.len)"]
    E4["mbedtls_md_hmac_update\n(&ctx, msg.bytes, msg.len)"]
    F4["mbedtls_md_hmac_finish\n(&ctx, result[32])"]
    G4["for i in 0..31:\n  snprintf(out+i*2, '%02x', result[i])"]
    H4["mbedtls_md_free(&ctx)"]
    OUT4(["📤 64-char lowercase hex HMAC"])

    IN4 --> A4 --> B4 --> C4 --> D4 --> E4 --> F4 --> G4 --> H4 --> OUT4
```

### IV.2 Constant-Time Compare — safeEq64()

> Chỉ dùng ở **Gateway Node** (bước xác minh HMAC)

```mermaid
flowchart TD
    CI["📥 a[64] · b[64]\n(2 chuỗi HMAC cần so sánh)"]
    DI["diff = 0  ← uint8_t"]
    LC["for i = 0 → 63\n(luôn đủ 64 bước, không dừng sớm)"]
    XO["diff |= (a[i] XOR b[i])"]
    CD{"diff == 0?\n(sau 64 vòng)"}
    EQ(["✅ return true — Khớp"])
    NEQ(["❌ return false — Không khớp"])

    CI --> DI --> LC --> XO
    XO -->|"i < 63"| LC
    XO -->|"i = 63"| CD
    CD -->|"Có"| EQ
    CD -->|"Không"| NEQ
```

> ⚠️ **Lý do:** `strcmp()` dừng ở byte đầu tiên khác nhau — kẻ tấn công đo thời gian để đoán từng ký tự HMAC (Timing Attack). `safeEq64()` luôn chạy đúng 64 iteration.

### IV.3 WiFi Auto-Reconnect — wifiMaintain()

> Gọi mỗi `loop()` ở **cả hai node**. Gateway dùng interval 10s, Sensor Node reconnect ngay.

```mermaid
flowchart TD
    WC["wifiMaintain() — gọi mỗi loop()"]
    IC{"WiFi.status()\n== WL_CONNECTED?"}
    FT["_connected = true"]
    WC2{"_connected\ntrước đó == true?"}
    FF["_connected = false\nLog: WiFi disconnected"]
    RC["WiFi.reconnect()\nhoặc WiFi.begin(SSID, PASS)"]
    RET(["↩ return"])

    WC --> IC
    IC -->|"✅ Kết nối"| FT --> RET
    IC -->|"❌ Mất"| WC2
    WC2 -->|"✅ Vừa mất"| FF --> RC --> RET
    WC2 -->|"❌ Đang retry"| RC --> RET
```

### IV.4 Đồng Bộ NTP — ntpSetup()

> Gọi một lần trong `setup()` ở **cả hai node**. NTP là tiền điều kiện để HMAC timestamp hợp lệ.

```mermaid
flowchart TD
    NS["ntpSetup()"]
    CN["configTime(UTC+7_OFFSET, 0,\n  'pool.ntp.org', 'time.nist.gov')"]
    RI["retry = 0"]
    GT["getLocalTime(&timeInfo)"]
    TO{"Lấy giờ OK?"}
    SF["_synced = true\nLog: NTP synced ✅"]
    IR["retry++"]
    MR{"retry >= 20?\n(= 10 giây)"}
    DL["delay(500ms)"]
    GU["_synced = false\nLog: NTP sync failed ❌"]
    ND(["↩ Kết thúc ntpSetup"])

    NS --> CN --> RI --> GT --> TO
    TO -->|"✅"| SF --> ND
    TO -->|"❌"| IR --> MR
    MR -->|"Chưa"| DL --> GT
    MR -->|"Đủ 20 lần"| GU --> ND
```

---

## V. END-TO-END — Luồng Hoàn Chỉnh

```mermaid
sequenceDiagram
    participant DHT as 🌡️ DHT22
    participant SN as ⚡ Sensor Node
    participant NTP as 🕐 NTP Server
    participant MQ as 📡 MQTT Broker
    participant GW as 🔀 Gateway Node
    participant API as ⚙️ Backend API

    Note over SN,NTP: ══ SETUP: Sensor Node ══
    SN->>NTP: configTime(UTC+7) + getLocalTime
    NTP-->>SN: Unix timestamp ✅
    SN->>MQ: MQTT Connect

    Note over GW,NTP: ══ SETUP: Gateway Node ══
    GW->>NTP: configTime(UTC+7) + getLocalTime
    NTP-->>GW: Unix timestamp ✅
    GW->>MQ: MQTT Subscribe local/sensors/+/data

    Note over SN,DHT: ══ LOOP mỗi 5 giây ══
    SN->>DHT: readHumidity() + readTemperature()
    DHT-->>SN: {temp: 28.5°C, humidity: 65.2%}
    SN->>SN: msg = "DEVICE_ID:timestamp"
    SN->>SN: sn_hmac = HMAC-SHA256(SECRET_KEY, msg)
    SN->>MQ: Publish {sensor_id, sn_ts, sn_hmac, data}

    Note over GW,API: ══ EVENT: Message đến Gateway ══
    MQ->>GW: local/sensors/SN-ID/data
    GW->>GW: ① Parse JSON
    GW->>GW: ② findSensorSecret → Whitelist OK
    GW->>GW: ③ |now − sn_ts| <= 300s → OK
    GW->>GW: ④ safeEq64(sn_hmac, expected) → OK
    GW->>GW: ⑤ gw_hmac = HMAC-SHA256(GW_SECRET, "gw_id:gw_ts")
    GW->>API: HTTP POST /api/device/data
    API-->>GW: HTTP 200 OK
    GW->>GW: 💡 Blink LED_FWD 100ms
```

---

## VI. BẢO MẬT — Tổng Hợp

| Cơ Chế | Node Áp Dụng | Mô Tả | Chống |
|---------|-------------|--------|-------|
| **HMAC-SHA256** | Cả hai | Ký/xác minh payload với secret key 256-bit | Giả mạo dữ liệu |
| **Timestamp Window ±300s** | Gateway | Từ chối message cũ hơn 5 phút | Replay Attack |
| **Constant-Time Compare** | Gateway | `safeEq64()` — không dừng sớm | Timing Attack |
| **Sensor Whitelist** | Gateway | `KNOWN_SENSORS[]` tĩnh trong firmware | Thiết bị giả mạo |
| **Dual Signature** | Gateway | Gửi cả sn_hmac + gw_hmac lên backend | Giả mạo gateway |
| **Unique Keys** | Cả hai | Mỗi thiết bị có secret key riêng từ server | Blast radius khi lộ key |
