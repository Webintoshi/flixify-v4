const axios = require('axios');

async function testM3U() {
  const url = 'http://rexww.xyz:8080/get.php?username=3bf14ce3&password=1ef71ed9&type=m3u_plus&output=ts';
  
  console.log('Testing M3U URL:', url);
  
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      responseType: 'text',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
      }
    });
    
    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Content-Length:', response.data?.length);
    console.log('Preview:', response.data?.substring(0, 200));
  } catch (error) {
    console.log('❌ FAILED!');
    console.log('Error:', error.message);
    console.log('Code:', error.code);
    console.log('Response Status:', error.response?.status);
    console.log('Response Data:', error.response?.data?.substring?.(0, 200));
  }
}

testM3U();
