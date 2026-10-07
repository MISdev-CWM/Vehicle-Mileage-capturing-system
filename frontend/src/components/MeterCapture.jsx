import { useState, useRef, useEffect } from 'react';
import api from '../api';

const MeterCapture = ({ vehicleId, driverName }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [mode, setMode] = useState('camera');
  const [capturedImage, setCapturedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [hasAnalyzedImage, setHasAnalyzedImage] = useState(false);
  
  const [formData, setFormData] = useState({
    mileage: '',
    confidence: 0,
    rawText: '',
    isCorrected: false,
    originalMileage: null
  });

  // Start camera when mode switches to camera
  useEffect(() => {
    let stream = null;
    if (mode === 'camera' && !capturedImage) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => setError('Camera access denied. Please use file upload.'));
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [mode, capturedImage]);

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      setCapturedImage(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCapturedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const analyzeImage = async () => {
    if (!capturedImage) return;
    setLoading(true);
    setError(null);

    const data = new FormData();
    data.append('meterImage', capturedImage, 'meter.jpg');

    try {
      const res = await api.post('/readings/extract', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 35000
      });

      const extracted = res.data.extracted;
      setFormData({
        mileage: extracted.mileage.toString(),
        confidence: extracted.confidence,
        rawText: extracted.rawText,
        isCorrected: false,
        originalMileage: extracted.mileage
      });
      setHasAnalyzedImage(true);
    } catch (err) {
      const msg = err.response?.data?.suggestion || err.response?.data?.error || 'Analysis failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitReading = async () => {
    const mileageNum = parseInt(formData.mileage);
    if (isNaN(mileageNum) || mileageNum < 0) {
      setError('Please enter a valid mileage number');
      return;
    }

    const isCorrected = formData.originalMileage !== null && mileageNum !== formData.originalMileage;

    try {
      const payload = {
        vehicleId,
        mileage: mileageNum,
        rawText: formData.rawText,
        confidence: formData.confidence,
        isCorrected,
        originalMileage: formData.originalMileage,
        location: null,
        driverName: driverName || ''
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            payload.location = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            };
          },
          () => {}
        );
      }

      await api.post('/readings', payload);
      
      setSuccess(true);
      setTimeout(() => {
        resetAll();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save reading');
    }
  };

  const resetAll = () => {
    setCapturedImage(null);
    setPreviewUrl(null);
    setFormData({ mileage: '', confidence: 0, rawText: '', isCorrected: false, originalMileage: null });
    setHasAnalyzedImage(false);
    setError(null);
    if (mode === 'camera') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(s => { if (videoRef.current) videoRef.current.srcObject = s; });
    }
  };

  const confidenceColor = formData.confidence > 0.85 ? 'bg-emerald-100 text-emerald-800' :
                          formData.confidence > 0.6 ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800';

  const confidenceLabel = formData.confidence > 0.85 ? 'High Confidence' :
                          formData.confidence > 0.6 ? 'Medium Confidence' :
                          'Low Confidence — Please Verify';

  return (
    <div className="space-y-6">
      {/* Success Toast */}
      {success && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg animate-bounce">
          ✅ Reading Saved!
        </div>
      )}

      {/* Mode Toggle */}
      {!capturedImage && (
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => { setMode('camera'); setError(null); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              mode === 'camera' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📷 Camera
          </button>
          <button
            onClick={() => { setMode('upload'); stopCamera(); setError(null); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              mode === 'upload' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📁 Upload
          </button>
        </div>
      )}

      {/* Camera Mode */}
      {!capturedImage && mode === 'camera' && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          
          {/* Overlay Frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-28">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400" />
              <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-sm" />
              
              {/* Scanning line animation */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="w-full h-1 bg-emerald-400/60 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-scan" />
              </div>
            </div>
          </div>
          
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white/80 text-sm font-medium drop-shadow-md">Align odometer within the frame</p>
          </div>

          {/* Shutter Button */}
          <button
            onClick={capturePhoto}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white/90 border-4 border-white shadow-lg hover:scale-105 transition-transform active:scale-95"
          >
            <div className="w-full h-full rounded-full border-2 border-slate-300" />
          </button>
        </div>
      )}

      {/* Upload Mode */}
      {!capturedImage && mode === 'upload' && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-brand-400 hover:bg-brand-50 transition-all cursor-pointer"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">Click to select odometer photo</p>
          <p className="text-slate-400 text-sm mt-1">JPG, PNG up to 10MB</p>
        </div>
      )}

      {/* Preview & Analyze */}
      {capturedImage && !hasAnalyzedImage && (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
            <img src={previewUrl} alt="Captured" className="w-full h-full object-contain" />
          </div>
          
          <div className="flex gap-3">
            <button onClick={resetAll} className="btn-secondary flex-1">
              ↺ Retake
            </button>
            <button 
              onClick={analyzeImage} 
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                '🔍 Read Odometer'
              )}
            </button>
          </div>
          
          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-blue-800 font-medium text-sm">Running EasyOCR analysis...</p>
                <p className="text-blue-600 text-xs mt-0.5">This may take a few seconds on first run</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-red-800 font-medium text-sm">{error}</p>
            <p className="text-red-600 text-xs mt-1">Tip: Ensure good lighting, no glare, and the odometer fills most of the frame</p>
          </div>
        </div>
      )}

      {/* Verification Form */}
      {hasAnalyzedImage && (
        <div className="card space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Verify Reading</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${confidenceColor}`}>
              {confidenceLabel} · {(formData.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mileage <span className="text-red-500">*</span>
                {formData.isCorrected && (
                  <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    ✏️ Edited
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.mileage}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    mileage: e.target.value,
                    isCorrected: prev.originalMileage !== null && parseInt(e.target.value) !== prev.originalMileage
                  }))}
                  className={`input text-lg font-mono tracking-wide ${
                    formData.isCorrected ? 'border-amber-400 bg-amber-50/30 focus:ring-amber-500 focus:border-amber-500' : ''
                  }`}
                  placeholder="000000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">km</span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {formData.isCorrected 
                  ? 'You have manually edited this value. Original OCR result: ' + formData.originalMileage.toLocaleString()
                  : 'Please verify the number matches your odometer exactly'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Vehicle ID</label>
              <input type="text" value={vehicleId} disabled className="input bg-slate-100 text-slate-500 cursor-not-allowed" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Detected Text</label>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-mono text-slate-600 break-all">{formData.rawText || 'No text detected'}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={resetAll} className="btn-secondary flex-1">
              ↺ Retake Photo
            </button>
            <button onClick={submitReading} className="btn-primary flex-1">
              ✓ Confirm & Save
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default MeterCapture;
