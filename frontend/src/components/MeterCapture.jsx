import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

const MeterCapture = ({ vehicleId, driverName, divisionId, divisionName, reason, allowRental = false, onSaved }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraRetry, setCameraRetry] = useState(0);
  const [mileage, setMileage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saveWarning, setSaveWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [rentalChecked, setRentalChecked] = useState(false);
  const [rentalIsOpen, setRentalIsOpen] = useState(false);
  const [rentalStatusLoading, setRentalStatusLoading] = useState(allowRental);
  const isCameraAvailable = typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!allowRental) return undefined;

    let isActive = true;
    api.get(`/readings/rental-status/${vehicleId}`)
      .then(response => {
        if (!isActive) return;
        const isOut = Boolean(response.data.isOut);
        setRentalIsOpen(isOut);
        setRentalChecked(isOut);
      })
      .catch(statusError => {
        if (isActive) {
          setError(statusError.response?.data?.error || 'Failed to load rental status.');
        }
      })
      .finally(() => {
        if (isActive) setRentalStatusLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [allowRental, vehicleId]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!capturedImage && isCameraAvailable) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          if (!isActive) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          if (isActive) {
            setError('Unable to access the camera. Allow camera permission and try again.');
          }
        });
    }

    return () => {
      isActive = false;
      stopCamera();
    };
  }, [capturedImage, cameraRetry, isCameraAvailable, stopCamera]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!video || !canvas || !context || !video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready. Please wait and try again.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      if (!blob) {
        setError('Could not capture the photo. Please try again.');
        return;
      }
      setCapturedImage(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setError('');
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setPreviewUrl(null);
    setMileage('');
    setError('');
    setSaveWarning('');
  };

  const submitReading = async () => {
    const mileageNumber = Number(mileage);
    if (!capturedImage) {
      setError('Capture an odometer photo before saving.');
      return;
    }
    if (!mileage.trim() || !Number.isSafeInteger(mileageNumber) || mileageNumber < 0) {
      setError('Please enter a valid mileage number.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveWarning('');

    const data = new FormData();
    data.append('meterImage', capturedImage, 'meter.jpg');
    data.append('vehicleId', vehicleId);
    data.append('mileage', String(mileageNumber));
    data.append('driverName', driverName || '');
    data.append('division', divisionId || '');
    data.append('divisionName', divisionName || '');
    data.append('reason', reason || '');
    data.append('isRental', String(rentalChecked));

    try {
      if (navigator.geolocation) {
        const location = await new Promise(resolve => {
          navigator.geolocation.getCurrentPosition(
            position => resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }),
            () => resolve(null),
            { timeout: 5000 }
          );
        });
        if (location) {
          data.append('location', JSON.stringify(location));
        }
      }

      const response = await api.post('/readings', data, { timeout: 30000 });
      const meterType = response.data.reading?.meterType;
      const isRental = response.data.reading?.isRental;
      setSuccess(meterType ? `${isRental ? 'Rental ' : ''}${meterType.toUpperCase()} Reading Saved!` : 'Reading Saved!');
      setSaveWarning(response.data.warning || '');
      if (isRental) {
        const isOut = meterType === 'out';
        setRentalIsOpen(isOut);
        setRentalChecked(isOut);
      }
      onSaved?.();
      window.setTimeout(() => {
        resetCapture();
        setSuccess(false);
      }, 2000);
    } catch (submitError) {
      setError(submitError.response?.data?.error || 'Failed to save reading and photo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {success && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg">
          {success}
        </div>
      )}

      {saveWarning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3" role="status">
          {saveWarning}
        </div>
      )}

      {allowRental && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={rentalChecked}
              disabled={rentalStatusLoading || rentalIsOpen || saving}
              onChange={event => setRentalChecked(event.target.checked)}
              className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Rental vehicle</span>
              <span className="block text-sm text-slate-500 mt-1">
                {rentalStatusLoading
                  ? 'Checking rental status...'
                  : rentalIsOpen
                    ? 'Vehicle is checked out. Record the IN return reading to unlock normal readings.'
                    : rentalChecked
                      ? 'This reading will be OUT (checkout). Record an IN reading when the vehicle is returned.'
                      : 'Tick this when recording a rental checkout and return.'}
              </span>
            </span>
          </label>
          {rentalChecked && !rentalStatusLoading && (
            <p className="text-xs font-semibold text-brand-700 mt-3 ml-7">
              Next reading: {rentalIsOpen ? 'IN — Rental return' : 'OUT — Rental checkout'}
            </p>
          )}
        </div>
      )}

      {!capturedImage ? (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setCameraReady(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-28">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400" />
              <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-sm" />
            </div>
          </div>
          <div className="absolute top-4 left-0 right-0 text-center">
            <p className="text-white/90 text-sm font-medium drop-shadow-md">
              {!isCameraAvailable
                ? 'Camera access is not available in this browser'
                : cameraReady ? 'Align the odometer within the frame' : 'Starting camera...'}
            </p>
          </div>
          <button
            type="button"
            onClick={capturePhoto}
            disabled={!cameraReady || !isCameraAvailable}
            aria-label="Take odometer photo"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white/90 border-4 border-white shadow-lg hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-full h-full rounded-full border-2 border-slate-300" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
            <img src={previewUrl} alt="Captured odometer" className="w-full h-full object-contain" />
          </div>

          <div>
            <label htmlFor="mileage" className="block text-sm font-medium text-slate-700 mb-1.5">
              Odometer mileage (km) <span className="text-red-500">*</span>
            </label>
            <input
              id="mileage"
              type="number"
              min="0"
              step="1"
              required
              value={mileage}
              onChange={event => setMileage(event.target.value)}
              className="input text-lg font-mono tracking-wide"
              placeholder="Enter the displayed mileage"
            />
          </div>

          <p className="text-sm text-slate-500">
            This photo will be saved with the reading. The mileage must be entered manually.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={resetCapture} disabled={saving} className="btn-secondary flex-1">
              Retake photo
            </button>
            <button
              type="button"
              onClick={submitReading}
              disabled={saving || success || rentalStatusLoading}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save reading'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
          <p className="text-red-800 font-medium text-sm">{error}</p>
          {!capturedImage && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setCameraRetry(value => value + 1);
              }}
              className="text-sm font-medium underline mt-2"
            >
              Retry camera
            </button>
          )}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default MeterCapture;
