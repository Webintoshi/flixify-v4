# Circuit Breaker Sıfırlama

## Sorun
Circuit Breaker açık kalmış ("M3U Circuit Breaker OPENED")

## Çözüm 1: Backend Restart (En Hızlı)
```bash
ssh root@46.225.183.57
cd /var/www/flixify-pro
docker-compose restart backend
```

## Çözüm 2: Admin API ile Reset
```bash
curl -X POST \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  http://46.225.183.57:3000/api/v1/m3u/reset-circuit-breaker
```

## Kalıcı Çözüm: Circuit Breaker Süresini Kısalt

`src/api/controllers/M3uController.js`:

```javascript
this._circuitBreaker = new CircuitBreaker(this._fetchM3u.bind(this), {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,  // 30s -> 10s (daha hızlı kapanma)
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  name: 'm3u-fetcher'
});
```

