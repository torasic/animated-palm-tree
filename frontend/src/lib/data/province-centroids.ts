export interface ProvinceCentroid {
  name: string;
  lat: number;
  lng: number;
}

export const provinceCentroids: Record<string, { lat: number; lng: number }> = {
  'Aceh': { lat: 4.6951, lng: 96.7494 },
  'Bali': { lat: -8.4095, lng: 115.1889 },
  'Banten': { lat: -6.4058, lng: 106.0600 },
  'Bengkulu': { lat: -3.7928, lng: 102.2608 },
  'Di Yogyakarta': { lat: -7.8753, lng: 110.4262 },
  'Gorontalo': { lat: 0.6999, lng: 122.4556 },
  'Jambi': { lat: -1.6116, lng: 103.6060 },
  'Jawa Barat': { lat: -7.0909, lng: 107.6689 },
  'Jawa Tengah': { lat: -7.1510, lng: 110.1403 },
  'Jawa Timur': { lat: -7.5360, lng: 112.2384 },
  'Kalimantan Barat': { lat: -0.2789, lng: 111.4753 },
  'Kalimantan Selatan': { lat: -3.0926, lng: 115.2838 },
  'Kalimantan Tengah': { lat: -1.6814, lng: 113.3824 },
  'Kalimantan Timur': { lat: 1.6406, lng: 116.4194 },
  'Kalimantan Utara': { lat: 3.0731, lng: 116.0414 },
  'Kepulauan Bangka Belitung': { lat: -2.7410, lng: 106.4406 },
  'Kepulauan Riau': { lat: 3.9456, lng: 108.1428 },
  'Lampung': { lat: -4.5586, lng: 105.4000 },
  'Maluku': { lat: -3.2384, lng: 130.1453 },
  'Maluku Utara': { lat: 1.5700, lng: 127.8000 },
  'Nusa Tenggara Barat': { lat: -8.6529, lng: 117.3616 },
  'Nusa Tenggara Timur': { lat: -8.6574, lng: 121.0794 },
  'Papua': { lat: -4.2699, lng: 138.0804 },
  'Papua Barat': { lat: -1.3361, lng: 132.9000 },
  'Riau': { lat: 0.5071, lng: 101.5408 },
  'Sulawesi Barat': { lat: -2.8441, lng: 119.3324 },
  'Sulawesi Selatan': { lat: -3.6687, lng: 119.9741 },
  'Sulawesi Tengah': { lat: -1.4300, lng: 121.4456 },
  'Sulawesi Tenggara': { lat: -4.1449, lng: 122.1746 },
  'Sulawesi Utara': { lat: 0.6247, lng: 123.9750 },
  'Sumatera Barat': { lat: -0.7399, lng: 100.8000 },
  'Sumatera Selatan': { lat: -3.3194, lng: 103.9144 },
  'Sumatera Utara': { lat: 2.1153, lng: 99.5450 },
  'DKI Jakarta': { lat: -6.2088, lng: 106.8456 }
};
