# คู่มือการใช้งาน API แผนที่สำหรับฝั่ง Frontend (ภาษาไทย)

เวอร์ชัน: 1.0

สรุปสั้น ๆ
- Backend มี endpoints สำหรับคำนวณระยะทาง/เวลา/ค่าส่ง, เก็บ Address, และอัพเดตตำแหน่งไรเดอร์
- FE ทำหน้าที่แสดงแผนที่ รับพิกัดจากผู้ใช้/ร้าน และเรียก BE เพื่อคำนวณและยืนยันค่าส่ง

Config ที่สำคัญ
- ค่าอยู่ในไฟล์ `.env` (บนเซิร์ฟเวอร์)
  - `MONGO_URI` — URI ของ MongoDB
  - `LONGDO_API_KEY` — คีย์ Longdo สำหรับแผนที่/Geocoding (ใช้บน FE เฉพาะเมื่ออนุญาต)

หลักการ payload
- พิกัดรับได้ในสองรูปแบบ:
  1. GeoJSON Point: `{ "type":"Point", "coordinates":[lng,lat] }`
  2. Simple object: `{ "lat":13.7, "lng":100.5 }`
- Backend จะ normalize ให้เป็น GeoJSON (coordinates = [lng, lat])

API endpoints (base: `http://localhost:3000`)

- POST `/map/distance`
  - Request body: `{ "from": {...}, "to": {...} }`
  - Response: `{ "distanceKm": number, "durationMin": number }`
  - คำอธิบาย: คำนวณระยะทางแบบ Haversine และประมาณเวลา (ค่าโดยประมาณ)

- POST `/map/delivery-fee`
  - Request body: `{ "from":..., "to":... }` หรือ `{ "distanceKm": number }`
  - Response: `{ "fee": number, "distanceKm": number }`
  - สูตรเริ่มต้น: `fee = max(base, base + perKm * distanceKm)` (ค่า default ใส่ใน `.env`)

- POST `/addresses`
  - Request body: `{ "ownerType":"user"|"shop", "ownerId":"...", "label"?:"...", "location": {...} }`
  - Response: created address document (รวม `_id` และ `location` เป็น GeoJSON)

- GET `/addresses?ownerType=&ownerId=`
  - Query params: `ownerType`, `ownerId` (optional)
  - Response: `[]` รายการ addresses

- POST `/rider/location`
  - Request body: `{ "riderId":"r123", "location": {...} }`
  - Behavior: upsert ตำแหน่งไรเดอร์ใน collection `rider_locations`

- GET `/rider/location/:riderId`
  - Response: rider location document ล่าสุด

ตัวอย่างการเรียกจาก FE (fetch)

1) คำนวณระยะทาง
```js
const res = await fetch('/map/distance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: { lat: 13.7, lng: 100.5 }, to: { lat: 13.75, lng: 100.55 } })
});
const { distanceKm, durationMin } = await res.json();
```

2) คำนวณค่าส่ง
```js
const res = await fetch('/map/delivery-fee', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ distanceKm })
});
const { fee } = await res.json();
```

3) สร้าง address
```js
await fetch('/addresses', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ownerType: 'user', ownerId: 'u123', label: 'บ้าน', location: { lat: 13.7, lng: 100.5 } })
});
```

4) อัพเดตตำแหน่งไรเดอร์
```js
await fetch('/rider/location', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ riderId: 'r100', location: { lat: 13.72, lng: 100.52 } })
});
```

การแสดงแผนที่ (Longdo)
- หากต้องการใช้ Longdo บน FE ให้โหลด script ตามเอกสาร Longdo และใส่ key ที่ถูกอนุญาตให้ใช้บนโดเมน FE
- ตัวอย่าง init (จากเอกสาร):
```html
<script src="https://api.longdo.com/map/?key=YOUR_KEY"></script>
<div id="map" style="width:100%;height:400px"></div>
<script>
  var map = new longdo.Map({
    placeholder: document.getElementById('map'),
    location: { lon: 100.5351375, lat: 13.767734 },
    zoom: 10
  });
</script>
```

ข้อควรระวัง (FE)
- อย่าเชื่อค่าส่งจากฝั่ง FE ในขั้นตอนจ่ายเงิน — ให้เรียก BE เพื่อขอค่าส่งที่ยืนยันแล้วก่อนยืนยันคำสั่งซื้อ
- ตรวจสอบไวยากรณ์พิกัด (lat: -90..90, lng: -180..180)
- สำหรับตำแหน่งเรียลไทม์ แนะนำใช้ WebSocket หรือ SSE หากต้องการ latency ต่ำ; หากไม่สะดวกให้ใช้ polling ทุก 3-5 วินาที

แนวทาง UX
- แสดงค่าส่งจาก BE เป็นค่า "ยืนยันแล้ว" เมื่อคำสั่งซื้อถูกสร้าง
- ในหน้า checkout แสดง "ประมาณการ" (จาก /map/delivery-fee) และข้อความว่า "ราคาสุดท้ายจะยืนยันจากเซิร์ฟเวอร์เมื่อสร้างคำสั่งซื้อ"

Debugging / ตัวอย่าง curl
```bash
# ระยะ
curl -s -X POST http://localhost:3000/map/distance -H 'Content-Type: application/json' -d '{"from":{"lat":13.7,"lng":100.5},"to":{"lat":13.75,"lng":100.55}}'

# สร้าง address
curl -s -X POST http://localhost:3000/addresses -H 'Content-Type: application/json' -d '{"ownerType":"user","ownerId":"u123","label":"บ้าน","location":{"lat":13.7,"lng":100.5}}'
```

ถ้าต้องการตัวอย่าง Component จริง ๆ (React/Vue) หรือการเชื่อม WebSocket ให้บอกผมว่าต้องการแบบไหน ผมจะสร้างตัวอย่างให้ครับ
