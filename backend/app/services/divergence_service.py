import numpy as np
from scipy.signal import find_peaks
from typing import List, Dict, Any

class DivergenceService:
    def calculate_divergence(self, prices: List[float]) -> Dict[str, Any]:
        n = len(prices)
        if n < 10:
            return {
                "divergence_score": 0.0,
                "classification": "Stabil/Fluktuasi Normal",
                "average_oscillation_amplitude": 0.0,
                "average_oscillation_frequency_days": 0.0,
                "price_change_pct": 0.0,
                "current_price": prices[-1] if prices else 0.0,
                "data_points": n
            }

        prices_arr = np.array(prices, dtype=float)
        x = np.arange(n)

        # 1. Fit linear trend line: P_t = a * t + b
        slope, intercept = np.polyfit(x, prices_arr, 1)
        trend = slope * x + intercept

        # 2. Compute percentage deviation from the trend: D_t = (|P_t - Trend_t| / Trend_t) * 100
        # Protect against division by zero
        trend_safe = np.where(trend == 0, 1.0, trend)
        pct_deviations = (np.abs(prices_arr - trend) / trend_safe) * 100

        # 3. Fit linear regression on percentage deviations: D_t = m_d * t + c
        res_slope, res_intercept = np.polyfit(x, pct_deviations, 1)

        # 4. Calculate Divergence Score (drift in percentage points over the timeframe of n days)
        divergence_score = res_slope * n

        # Classification thresholds
        if divergence_score > 5.0:
            classification = "Divergen (Makin Bergejolak)"
        elif divergence_score < -5.0:
            classification = "Konvergen (Makin Stabil)"
        else:
            classification = "Stabil/Fluktuasi Normal"

        # 5. Peak and Trough Detection for Oscillation Analysis
        # Use distance=3 to avoid finding high-frequency daily noise
        peaks, _ = find_peaks(prices_arr, distance=3)
        troughs, _ = find_peaks(-prices_arr, distance=3)

        # Combine and sort peaks/troughs chronologically
        extrema = []
        for idx in peaks:
            extrema.append((idx, "peak", prices_arr[idx]))
        for idx in troughs:
            extrema.append((idx, "trough", prices_arr[idx]))
        extrema.sort(key=lambda item: item[0])

        # Compute oscillation amplitudes and periods (durations between consecutive extrema)
        amplitudes = []
        durations = []
        
        for i in range(1, len(extrema)):
            prev_idx, prev_type, prev_val = extrema[i-1]
            curr_idx, curr_type, curr_val = extrema[i]
            
            # Amplitude is the absolute difference in price
            amplitudes.append(abs(curr_val - prev_val))
            # Duration in days (time index difference)
            durations.append(curr_idx - prev_idx)

        # Calculate average amplitude and cycle frequency (a full cycle is peak-to-peak or trough-to-trough)
        avg_amplitude = float(np.mean(amplitudes)) if amplitudes else 0.0
        
        # Period of full oscillation is roughly 2 * average duration between extremums
        avg_frequency = float(2 * np.mean(durations)) if durations else 0.0

        # If peak/trough list is empty, default to general standard deviation of price
        if not amplitudes or len(extrema) < 2:
            avg_amplitude = float(np.std(prices_arr))
            avg_frequency = float(n / 4) # fallback assumption: 4 cycles over timeframe

        # Price change percentage
        price_change_pct = ((prices_arr[-1] - prices_arr[0]) / prices_arr[0] * 100) if prices_arr[0] != 0 else 0.0

        return {
            "divergence_score": float(divergence_score),
            "classification": classification,
            "average_oscillation_amplitude": avg_amplitude,
            "average_oscillation_frequency_days": avg_frequency,
            "price_change_pct": float(price_change_pct),
            "current_price": float(prices_arr[-1]),
            "data_points": n
        }

divergence_service = DivergenceService()
