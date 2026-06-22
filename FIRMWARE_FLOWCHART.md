# Lưu Đồ Thuật Toán Firmware — IoT Manager

> Đọc theo thứ tự: **Tổng quan → Sensor Node → Gateway Node → Dùng chung → End-to-End → Bảo mật**

---

## I. TỔNG QUAN HỆ THỐNG

### I.1 Kiến Trúc & Luồng Dữ Liệu

```mermaid
flowchart LR
    DHT22["🌡️ DHT22\nSensor"]
    SN["⚡ Sensor Node\nESP32 DOIT V1"]
    BROKER1["📡 MQTT Broker 1\nMosquitto :1883"]
    GW["🔀 Gateway Node\nESP32 DOIT V1"]
    BROKER2["📡 MQTT Broker 2\nMosquitto :1884"]
    BE["⚙️ Backend API\nExpress.js :5000"]
    DB["🗄️ Database\nMySQL 8.0"]
    FE["📊 Dashboard\nNext.js :3000"]

    DHT22 -->|"GPIO4 · 1-Wire"| SN
    SN -->|"MQTT Publish\nJSON + HMAC-SHA256\ntopic: local/sensors/{id}/data"| BROKER1
    BROKER1 -->|"MQTT Subscribe\nwildcard: local/sensors/+/data"| GW
    GW -->|"Validate → Re-sign\nMQTT Publish: gateway/{gw_id}/data"| BROKER2
    BROKER2 -->|"MQTT Subscribe\nwildcard: gateway/+/data"| BE
    BE --> DB --> FE
```

**Mô tả:** Dữ liệu khởi đầu từ cảm biến DHT22 kết nối vật lý vào Sensor Node qua GPIO4. Sensor Node đóng gói nhiệt độ và độ ẩm thành JSON, ký HMAC-SHA256, rồi publish lên MQTT Broker 1 (port 1883) theo topic `local/sensors/{id}/data`. Gateway Node — đang subscribe wildcard `local/sensors/+/data` trên Broker 1 — nhận gói tin, xác minh tính hợp lệ, ký lại bằng chữ ký gateway, rồi publish lên MQTT Broker 2 (port 1884) theo topic `gateway/{gw_id}/data`. Backend API subscribe Broker 2, xác minh cả hai lớp HMAC, lưu vào MySQL, và Dashboard Next.js hiển thị cho người dùng. Hai broker tách biệt là thiết kế có chủ đích: Broker 1 là mạng nội bộ firmware, Broker 2 là đường truyền gateway→backend.

### I.2 Sơ Đồ Toàn Hệ Thống — Full Stack (Frontend → Backend → DB → Firmware)

```mermaid
flowchart TB
    subgraph UI_LAYER ["🖥️ Lớp Giao Diện"]
        USER["👤 Người dùng\n(Trình duyệt)"]
        FE["📊 Frontend Dashboard\nNext.js · :3000"]
        USER -- "HTTP/HTTPS" --> FE
    end

    subgraph BE_LAYER ["⚙️ Lớp Backend"]
        API["🔧 REST API + MQTT Client\nExpress.js · :5000\n/api/devices\n/api/devices/:id/data\n/api/dashboard/stats"]
    end

    subgraph DB_LAYER ["🗄️ Lớp Dữ Liệu"]
        DB[("🗄️ MySQL 8.0\nDevices · SensorData\nAuditLog · Users")]
    end

    subgraph MSG_LAYER ["📡 Lớp Giao Tiếp"]
        MQTT1["📡 MQTT Broker 1\nMosquitto · :1883\nlocal/sensors/+/data"]
        MQTT2["📡 MQTT Broker 2\nMosquitto · :1884\ngateway/+/data"]
    end

    subgraph FW_LAYER ["🔌 Lớp Firmware — ESP32"]
        GW["🔀 Gateway Node\nESP32 DOIT V1\nValidate + Re-sign → MQTT Publish"]
        SN["⚡ Sensor Node\nESP32 DOIT V1\nĐọc DHT22 + Ký HMAC + MQTT Publish"]
    end

    subgraph HW_LAYER ["🌡️ Lớp Vật Lý"]
        DHT["🌡️ DHT22\nNhiệt độ · Độ ẩm"]
    end

    FE     -- "GET /api/devices\nGET /api/devices/:id/data\nGET /api/dashboard/stats" --> API
    API    -- "JSON response"                                  --> FE
    API   <-- "SQL Query / INSERT"                            --> DB
    API    -- "MQTT Subscribe\ngateway/+/data"                --> MQTT2
    GW     -- "MQTT Publish\ngateway/{gw_id}/data\n{gw_hmac, sn_hmac, data}" --> MQTT2
    SN     -- "MQTT Publish\nlocal/sensors/{id}/data\nJSON + HMAC-SHA256"    --> MQTT1
    MQTT1  -- "Subscribe\nlocal/sensors/+/data"               --> GW
    DHT    -- "GPIO4 · 1-Wire · đọc mỗi 5s"                  --> SN
```

**Mô tả:** Hình này tổ chức toàn bộ hệ thống thành 6 lớp xếp từ trên xuống: **(1) Lớp Giao Diện** — người dùng tương tác với Dashboard Next.js qua trình duyệt; **(2) Lớp Backend** — REST API Express.js đóng vai trò trung tâm xử lý, vừa phục vụ frontend vừa nhận dữ liệu từ firmware; **(3) Lớp Dữ Liệu** — MySQL lưu toàn bộ thiết bị, dữ liệu cảm biến, audit log và người dùng; **(4) Lớp Giao Tiếp** — hai MQTT Broker riêng biệt phân tách mạng nội bộ (Broker 1) khỏi đường lên backend (Broker 2); **(5) Lớp Firmware** — Gateway Node và Sensor Node trên ESP32 thực hiện đọc, ký và chuyển tiếp; **(6) Lớp Vật Lý** — cảm biến DHT22 đọc nhiệt độ và độ ẩm mỗi 5 giây. Mũi tên trong hình thể hiện chiều dữ liệu và giao thức sử dụng giữa mỗi lớp.

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

    subgraph GW_BOX ["🔀 GATEWAY NODE (ESP32 DOIT V1)"]
        direction TB
        G1["① Subscribe MQTT: local/sensors/+/data"]
        G2["② Validate: Whitelist + Timestamp + HMAC"]
        G3["③ Re-sign Gateway HMAC"]
        G4["④ MQTT Publish → Broker 2 :1884\ngateway/{gw_id}/data"]
        G1 --> G2 --> G3 --> G4
    end

    S4 -->|"MQTT Broker 1 :1883"| G1
```

**Mô tả:** Hình này làm rõ ranh giới trách nhiệm giữa hai thiết bị firmware. **Sensor Node** thực hiện 4 bước tuần tự: đọc dữ liệu từ DHT22, lấy timestamp UTC từ NTP, ký HMAC-SHA256, rồi publish lên Broker 1. **Gateway Node** cũng thực hiện 4 bước: lắng nghe tất cả topic sensor qua wildcard, xác minh whitelist + timestamp + HMAC của sensor, ký lại bằng HMAC của gateway, rồi publish lên Broker 2. Đầu ra của Sensor Node (bước ④) kết nối trực tiếp vào đầu vào của Gateway Node (bước ①) thông qua Broker 1. Thiết kế này cho phép gateway xác minh độc lập từng sensor mà không cần tin tưởng mù quáng vào nhau.

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

**Mô tả:** Đây là trình tự khởi động một lần của Sensor Node từ lúc cấp nguồn đến khi vào vòng lặp chính. Sau khi khởi tạo Serial, chương trình kết nối WiFi với timeout 20 giây — nếu không kết nối được vẫn tiếp tục (để tránh treo vô hạn). Tiếp theo đồng bộ NTP tối đa 20 lần thử (mỗi lần 500ms = 10 giây); nếu thất bại thì timestamp HMAC sẽ sai và backend sẽ từ chối mọi gói tin. DHT22 được khởi tạo với warmup 2 giây bắt buộc — bỏ qua delay này khiến lần đọc đầu tiên trả về NaN. Cuối cùng cấu hình PubSubClient để kết nối MQTT Broker 1 trước khi bước vào `loop()`.

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

**Mô tả:** Vòng lặp chính chạy liên tục, nhưng chỉ thực sự gửi dữ liệu mỗi 5000ms. Mỗi iteration bắt đầu bằng việc duy trì kết nối WiFi và MQTT (`wifiMaintain`, `mqttMaintain`). Sau đó kiểm tra bộ đếm thời gian — nếu chưa đủ 5 giây thì bỏ qua toàn bộ phần còn lại. Khi đủ thời gian, chương trình kiểm tra 3 điều kiện theo thứ tự: WiFi có kết nối không → NTP đã đồng bộ không → MQTT có kết nối không. Chỉ khi cả 3 điều kiện thỏa mãn mới thực sự đọc DHT22 và kiểm tra thêm lần nữa xem kết quả có phải NaN không. Nếu bất kỳ bước nào thất bại thì ghi log lý do và bỏ qua chu kỳ gửi, nhưng vẫn cập nhật `lastSendTime` để không spam retry liên tục.

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

**Mô tả:** Hàm này nhận một struct `SensorData` chứa nhiệt độ và độ ẩm, sau đó thực hiện 5 bước để tạo và gửi gói MQTT. Đầu tiên lấy timestamp UTC hiện tại từ NTP. Tiếp theo tạo chuỗi message theo định dạng `"DEVICE_ID:timestamp"` — định dạng này phải khớp chính xác với phía backend. Dùng mbedTLS tính HMAC-SHA256 của chuỗi đó với SECRET_KEY, cho ra 64 ký tự hex thường. Sau đó lắp tất cả vào JSON bao gồm `sensor_id`, `sn_timestamp`, `sn_hmac` và object `data`. Cuối cùng publish JSON lên topic `local/sensors/DEVICE_ID/data` qua PubSubClient, trả về `true` nếu broker xác nhận nhận thành công.

---

## III. GATEWAY NODE (ESP32 DOIT V1)

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

**Mô tả:** Trình tự khởi động của Gateway Node đơn giản hơn Sensor Node vì gateway không đọc cảm biến vật lý. Sau Serial và WiFi, chương trình đồng bộ NTP — đây là bước quan trọng vì gateway phải kiểm tra cửa sổ timestamp ±300 giây của các gói sensor đến. Cuối cùng `mqttClientSetup()` đồng thời đăng ký callback `onSensorMessage` và subscribe wildcard `local/sensors/+/data` trên Broker 1, sẵn sàng nhận dữ liệu từ mọi sensor node trên mạng cục bộ.

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

**Mô tả:** Vòng lặp Gateway là **event-driven** — không có bộ đếm thời gian cố định như Sensor Node. Phần lớn thời gian `loop()` chỉ gọi `wifiMaintain()` và `mqttClientMaintain()` (bên trong có `client.loop()` để nhận message từ broker). Logic chính duy nhất là quản lý LED chỉ thị: nếu đã đến thời điểm tắt LED (đã cài đặt 100ms sau khi forward thành công) thì tắt LED. Khi có MQTT message đến, thư viện PubSubClient tự động gọi callback `onSensorMessage()` — không cần polling thủ công.

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
    RES3 -->|"true (MQTT OK)"| LED_ON --> END3
    RES3 -->|"false"| LOG_F --> END3
```

**Mô tả:** Callback này là điểm nhập duy nhất khi Broker 1 đẩy message vào gateway. Bước đầu tiên là kiểm tra NTP đã đồng bộ chưa — nếu chưa thì drop ngay lập tức vì gateway không thể kiểm tra timestamp nếu đồng hồ của mình không chính xác. Nếu NTP OK thì gọi `forwardSensorData()` để thực hiện toàn bộ pipeline xác minh 5 bước. Khi pipeline trả về `true` (forward thành công lên Broker 2), gateway bật LED_FWD và đặt timer tắt LED sau 100ms — tín hiệu thị giác nhanh cho thấy dữ liệu đang chảy qua. Nếu thất bại chỉ ghi log, không có retry tự động.

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

    subgraph P5 ["⑤ Gateway Sign & MQTT Publish"]
        G1["gw_ts = getCurrentTimestamp()\ngw_hmac = HMAC-SHA256(\n  GW_SECRET, 'gw_id:gw_ts'\n)"]
        G2["Build output JSON:\n{ gateway_id, gw_ts, gw_hmac,\n  gateway_ip, sensor_payload:\n  { sensor_id, sn_ts, sn_hmac,\n    data } }"]
        G3["PubSubClient.publish(\n  'gateway/GW_ID/data',\n  payload\n)"]
        G4{"Publish OK?"}
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
    G4 -->|"✅ OK"| OK5
    G4 -->|"❌"| ERR5
```

**Mô tả:** Đây là pipeline 5 bước xác minh tuần tự — mỗi bước thất bại sẽ return false ngay, không tiếp tục. **Bước ①** parse JSON payload, kiểm tra đủ 4 trường bắt buộc (`sensor_id`, `sn_timestamp`, `sn_hmac`, `data`). **Bước ②** tra cứu secret key của sensor trong registry động (fetch từ backend mỗi 5 phút) hoặc danh sách cứng `KNOWN_SENSORS[]` trong config — nếu sensor không có trong danh sách thì từ chối. **Bước ③** kiểm tra cửa sổ thời gian: hiệu số giữa đồng hồ gateway hiện tại và `sn_timestamp` phải trong khoảng ±300 giây, chống replay attack. **Bước ④** tính lại HMAC từ secret key và chuỗi `"sensor_id:sn_timestamp"`, so sánh constant-time với `sn_hmac` trong gói tin. **Bước ⑤** nếu tất cả hợp lệ: lấy timestamp gateway mới, ký HMAC gateway, ghép toàn bộ vào JSON đầu ra (bao gồm cả `sn_hmac` gốc để backend xác minh lại lần thứ hai), rồi publish lên Broker 2.

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

    IN4 --> A4 --> B4 --> C4 --> D4 --> E4 --> F4 --> H4 --> G4 --> OUT4
```

**Mô tả:** Hàm này ánh xạ trực tiếp vào 6 lời gọi API của mbedTLS. Đầu tiên khởi tạo context và lấy thông tin thuật toán SHA256. `mbedtls_md_setup` với tham số `1` bật chế độ HMAC (tham số `0` là chế độ hash thông thường — đây là chi tiết dễ nhầm). Ba lời gọi tiếp theo nạp key, nạp message, rồi hoàn tất tính toán vào buffer 32 bytes. Sau đó giải phóng context (quan trọng để tránh memory leak trên thiết bị nhúng). Cuối cùng dùng `snprintf` với format `%02x` để chuyển 32 bytes thành 64 ký tự hex thường — cách encode này khớp chính xác với `.toString("hex")` của Node.js trên backend.

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

**Mô tả:** Hàm so sánh hai chuỗi HMAC 64 ký tự theo cách **không để lộ thông tin về vị trí ký tự khác nhau**. Khởi tạo biến `diff = 0`, sau đó XOR từng cặp ký tự `a[i]` và `b[i]` rồi OR vào `diff` — vòng lặp **luôn chạy đủ 64 bước** dù hai chuỗi đã khác nhau từ bước đầu. Sau 64 bước nếu `diff == 0` thì hai chuỗi khớp nhau hoàn toàn. Nếu dùng `strcmp()` thay thế, hàm sẽ trả về ngay khi gặp ký tự đầu tiên khác — kẻ tấn công có thể gửi hàng nghìn HMAC giả và đo thời gian phản hồi để suy ra từng ký tự đúng (Timing Attack).

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

**Mô tả:** Hàm này được gọi mỗi `loop()` để giữ kết nối WiFi liên tục mà không block. Nếu `WiFi.status() == WL_CONNECTED` thì cập nhật cờ `_connected = true` và thoát ngay — đây là trường hợp phổ biến nhất, overhead tối thiểu. Khi mất kết nối, hàm kiểm tra xem trước đó có đang kết nối không: nếu có (vừa mất) thì ghi log "WiFi disconnected" rồi thử reconnect; nếu cờ đã là false (đang trong quá trình retry) thì bỏ qua log và tiếp tục retry. Gateway dùng interval 10 giây giữa các lần retry, Sensor Node reconnect ngay lập tức.

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

**Mô tả:** `ntpSetup()` chạy một lần duy nhất trong `setup()`. Sau khi gọi `configTime()` để cấu hình timezone UTC+7 và chỉ định hai NTP server dự phòng, chương trình thử lấy giờ qua `getLocalTime()` tối đa 20 lần với delay 500ms mỗi lần (tổng 10 giây). Nếu thành công, đặt cờ `_synced = true` — các hàm khác kiểm tra cờ này trước khi dùng timestamp. Nếu thất bại sau 20 lần, đặt `_synced = false` và tiếp tục chương trình nhưng HMAC của mọi gói tin sẽ bị backend từ chối do timestamp sai. Đây là lý do NTP là tiền điều kiện cứng cho toàn bộ hệ thống bảo mật.

---

## V. END-TO-END — Luồng Hoàn Chỉnh

```mermaid
sequenceDiagram
    participant DHT as 🌡️ DHT22
    participant SN as ⚡ Sensor Node
    participant NTP as 🕐 NTP Server
    participant MQ1 as 📡 MQTT Broker 1
    participant GW as 🔀 Gateway Node
    participant MQ2 as 📡 MQTT Broker 2
    participant API as ⚙️ Backend API
    participant DB as 🗄️ MySQL DB
    participant FE as 📊 Next.js :3000
    participant NGX as 🌐 Nginx
    participant USR as 👤 Trình duyệt

    Note over SN,NTP: ══ SETUP: Sensor Node ══
    SN->>NTP: configTime(UTC+7) + getLocalTime
    NTP-->>SN: Unix timestamp ✅
    SN->>MQ1: MQTT Connect

    Note over GW,NTP: ══ SETUP: Gateway Node ══
    GW->>NTP: configTime(UTC+7) + getLocalTime
    NTP-->>GW: Unix timestamp ✅
    GW->>MQ1: mqttSubClient → Subscribe local/sensors/+/data
    GW->>MQ2: mqttPubClient → Connect (publish-only)

    Note over SN,DHT: ══ LOOP mỗi 5 giây ══
    SN->>DHT: readHumidity() + readTemperature()
    DHT-->>SN: {temp: 28.5°C, humidity: 65.2%}
    SN->>SN: msg = "DEVICE_ID:timestamp"
    SN->>SN: sn_hmac = HMAC-SHA256(SECRET_KEY, msg)
    SN->>MQ1: Publish {sensor_id, sn_ts, sn_hmac, data}

    Note over GW,MQ1: ══ EVENT: Message đến Gateway ══
    MQ1->>GW: local/sensors/SN-ID/data
    GW->>GW: ① Parse JSON
    GW->>GW: ② Whitelist → findSensorSecret() ✅
    GW->>GW: ③ |now − sn_ts| ≤ 300s ✅
    GW->>GW: ④ safeEq64(sn_hmac, expected) ✅
    GW->>GW: ⑤ gw_hmac = HMAC-SHA256(GW_SECRET, "gw_id:gw_ts")
    GW->>MQ2: mqttPubClient.publish → gateway/GW-ID/data

    Note over API,DB: ══ BACKEND: Xử lý & Lưu trữ (mqttDataService) ══
    MQ2->>API: Subscribe gateway/+/data → nhận message
    API->>API: verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac)
    API->>API: verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac)
    API->>DB: SELECT device_type, status FROM devices WHERE id IN (gw, sn)
    DB-->>API: gwRow + snRow
    API->>DB: INSERT INTO sensor_data (device_id, gateway_id, payload)
    DB-->>API: ✅ insertId
    API->>DB: DELETE prune sensor_data giữ 150 bản ghi mới nhất
    API->>DB: UPDATE devices SET last_seen=NOW(), fail_count=0, last_ip=?
    API->>DB: INSERT INTO audit_log (event_type='DATA_RECV', device_id, ip_address, user_agent, details)
    DB-->>API: ✅ Audit ghi nhận
    GW->>GW: 💡 Blink LED_FWD 100ms

    Note over USR,NGX: ══ FRONTEND: Người dùng xem Dashboard ══
    USR->>NGX: GET / (HTTP :80)
    NGX->>FE: Proxy → Next.js :3000
    FE-->>NGX: HTML/JS Dashboard
    NGX-->>USR: Dashboard ✅

    Note over USR,DB: ══ SWR POLLING: Browser lấy dữ liệu (mỗi 10s) ══
    USR->>NGX: GET /api/devices (browser JS · SWR)
    NGX->>API: Proxy /api/ → Express :5000
    API->>DB: SELECT * FROM devices
    DB-->>API: Danh sách thiết bị
    API-->>NGX: JSON response
    NGX-->>USR: JSON ✅
    USR->>NGX: GET /api/devices/:id/data?limit=200 (SWR · 10s)
    NGX->>API: Proxy /api/ → Express :5000
    API->>DB: SELECT * FROM sensor_data WHERE device_id=? ORDER BY id DESC LIMIT 200
    DB-->>API: SensorData rows (payload JSON)
    API-->>NGX: JSON response
    NGX-->>USR: JSON ✅
    USR->>USR: Render biểu đồ nhiệt độ & độ ẩm 📊
```

**Mô tả:** Đây là sơ đồ trình tự đầy đủ nhất, thể hiện toàn bộ vòng đời của một bản đọc cảm biến từ phần cứng đến màn hình người dùng. Có thể đọc theo 5 giai đoạn:

- **Setup Sensor Node:** Đồng bộ NTP lấy Unix timestamp, kết nối MQTT Broker 1. Đây là điều kiện tiên quyết để HMAC có giá trị thời gian hợp lệ.
- **Setup Gateway Node:** Tương tự đồng bộ NTP riêng. Sau đó subscribe Broker 1 (lắng nghe sensor) và connect Broker 2 (chuẩn bị publish lên backend).
- **Loop mỗi 5 giây:** Sensor Node đọc DHT22, tạo chuỗi `"DEVICE_ID:timestamp"`, tính HMAC, đóng gói JSON và publish lên Broker 1.
- **Event xử lý tại Gateway:** Broker 1 đẩy message vào Gateway. Gateway thực hiện 5 bước xác minh, sau đó ký HMAC gateway và publish gói kép (chứa cả `sn_hmac` và `gw_hmac`) lên Broker 2.
- **Backend lưu trữ:** API nhận từ Broker 2, xác minh lại cả hai HMAC độc lập, truy vấn DB kiểm tra trạng thái thiết bị, insert dữ liệu sensor, prune giới hạn 150 bản ghi, cập nhật `last_seen` và ghi audit log.
- **Frontend polling:** Trình duyệt dùng SWR poll mỗi 10 giây, request đi qua Nginx proxy đến Express API, lấy danh sách thiết bị và dữ liệu cảm biến, render biểu đồ nhiệt độ và độ ẩm thời gian thực.

---

## VI. BẢO MẬT — Tổng Hợp

| Cơ Chế | Node Áp Dụng | Mô Tả | Chống |
|---------|-------------|--------|-------|
| **HMAC-SHA256** | Cả hai | Ký/xác minh payload với secret key 256-bit | Giả mạo dữ liệu |
| **Timestamp Window ±300s** | Gateway | Từ chối message cũ hơn 5 phút | Replay Attack |
| **Constant-Time Compare** | Gateway | `safeEq64()` — không dừng sớm | Timing Attack |
| **Sensor Whitelist** | Gateway | `KNOWN_SENSORS[]` cục bộ + dynamic fetch từ `/api/device/sensors` mỗi 5 phút | Thiết bị giả mạo |
| **Dual Signature** | Gateway | Gửi cả sn_hmac + gw_hmac lên backend | Giả mạo gateway |
| **Unique Keys** | Cả hai | Mỗi thiết bị có secret key riêng từ server | Blast radius khi lộ key |
