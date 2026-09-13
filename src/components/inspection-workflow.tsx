'use client'

/* Image previews intentionally use native img: blob URLs and authenticated image endpoints are not static image assets. */
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { AnalysisViewer } from '@/components/analysis-viewer'
import { ComplianceViewer } from '@/components/compliance-viewer'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleAlert,
  FileImage,
  ImagePlus,
  Info,
  LoaderCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  VideoOff,
} from 'lucide-react'

const IMAGE_LABELS = ['front', 'back', 'side', 'top', 'bottom'] as const
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
type ImageLabel = (typeof IMAGE_LABELS)[number]
type ImageSource = 'camera' | 'upload'
type CameraState = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'error'

type ProductDraft = {
  name: string
  brand: string
  manufacturer: string
  category: string
  packSize: string
  unit: string
  batchNumber: string
  declaredRetailPrice: string
  onlineListingUrl: string
}

type ImageDraft = {
  id: string
  file: File
  previewUrl: string
  label: ImageLabel
  source: ImageSource
}

type SavedInspection = {
  inspection: { id: string; status: string; imageCount: number; createdAt: string }
  product: { id: string; name: string }
  images: { id: string; label: ImageLabel; source: ImageSource; filename: string; url: string }[]
}

const initialProduct: ProductDraft = {
  name: '',
  brand: '',
  manufacturer: '',
  category: '',
  packSize: '',
  unit: '',
  batchNumber: '',
  declaredRetailPrice: '',
  onlineListingUrl: '',
}

const steps = [
  { label: 'Product information', shortLabel: 'Product' },
  { label: 'Capture images', shortLabel: 'Capture' },
  { label: 'Review', shortLabel: 'Review' },
  { label: 'Save', shortLabel: 'Save' },
]

const labelTitle = (label: ImageLabel) => label.charAt(0).toUpperCase() + label.slice(1)

function isEmbeddedFrame() {
  return typeof window !== 'undefined' && window.self !== window.top
}

function cameraUnsupportedMessage() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Camera access requires a secure (HTTPS) connection. Use the image upload fallback below.'
  }
  return 'This browser does not expose camera access. Use the image upload fallback below.'
}

function cameraBlockedMessage() {
  return isEmbeddedFrame()
    ? 'Camera access was blocked inside this embedded preview. Open the app in its own browser tab and allow the camera, or use image upload.'
    : 'Camera access was blocked. Allow camera permission for this site in your browser settings, then try again, or use image upload.'
}

function createDraft(file: File, source: ImageSource, label: ImageLabel): ImageDraft {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${source}-${Date.now()}`
  return { id, file, previewUrl: URL.createObjectURL(file), source, label }
}

function Field({ label, value, onChange, placeholder, required = false, type = 'text', help }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string; help?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-ink">{label}{required ? <span className="ml-1 text-amber">*</span> : null}</span>
      <input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} className="focus-ring h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-sm text-ink outline-none transition placeholder:text-[#aaa79e] focus:border-moss" />
      {help ? <span className="mt-1.5 block text-[11px] leading-4 text-muted">{help}</span> : null}
    </label>
  )
}

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex items-start justify-between gap-2" aria-label="Inspection progress">
      {steps.map((step, index) => {
        const complete = currentStep > index
        const active = currentStep === index
        return (
          <li key={step.label} className="flex min-w-0 flex-1 items-start gap-2 last:flex-none sm:gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold transition ${complete ? 'border-moss bg-moss text-white' : active ? 'border-amber bg-amber text-ink' : 'border-line bg-paper text-muted'}`}>
                {complete ? <Check size={15} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={`hidden text-xs font-semibold sm:block ${active ? 'text-ink' : complete ? 'text-moss' : 'text-muted'}`}>{step.label}</span>
            </div>
            {index < steps.length - 1 ? <span className={`mt-4 h-px min-w-3 flex-1 ${complete ? 'bg-moss' : 'bg-line'}`} /> : null}
          </li>
        )
      })}
    </ol>
  )
}

export function InspectionWorkflow() {
  const [step, setStep] = useState(0)
  const [product, setProduct] = useState<ProductDraft>(initialProduct)
  const [images, setImages] = useState<ImageDraft[]>([])
  const [selectedLabel, setSelectedLabel] = useState<ImageLabel>('front')
  const [pendingCapture, setPendingCapture] = useState<ImageDraft | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraMessage, setCameraMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SavedInspection | null>(null)
  const [saveError, setSaveError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<Set<string>>(new Set())
  // Incremented on every release and acquire, so a getUserMedia call that resolves after the user
  // navigated away can never adopt an abandoned stream and leave the camera light on.
  const cameraAttemptRef = useRef(0)
  // Remembers that the camera was live before we left the capture step, so returning resumes it.
  const resumeCameraRef = useRef(false)

  const updateProduct = (key: keyof ProductDraft, value: string) => setProduct((current) => ({ ...current, [key]: value }))

  /**
   * Pure hardware teardown. Touches no React state, so it is safe to call from an effect cleanup
   * and on unmount without triggering a render.
   */
  const stopTracks = useCallback(() => {
    // Invalidates any in-flight getUserMedia and any track listener from the previous stream.
    cameraAttemptRef.current += 1
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  /**
   * Teardown plus the matching state transition. Releasing the hardware and clearing the "live
   * preview" claim must be one indivisible operation: splitting them is exactly what left the
   * panel reporting a ready camera that no longer existed, with the restart control hidden behind
   * a `!ready` check and the capture button silently doing nothing. A failure reason is preserved
   * so the explanation is still on screen when the user comes back.
   */
  const releaseCamera = useCallback(() => {
    stopTracks()
    setCameraState((current) => (current === 'ready' || current === 'starting' ? 'idle' : current))
  }, [stopTracks])

  const stopCamera = useCallback(() => {
    stopTracks()
    resumeCameraRef.current = false
    setCameraState('idle')
    setCameraMessage('')
  }, [stopTracks])

  /**
   * Callback ref for the preview element. CaptureStep is unmounted on every other step, so the
   * <video> node is destroyed and recreated. Attaching here means a live stream is always re-bound
   * to whichever node currently exists instead of depending on a state change to re-run an effect.
   */
  const attachVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (!node) return
    const stream = streamRef.current
    if (!stream) return
    if (node.srcObject !== stream) node.srcObject = stream
    void node.play().catch(() => undefined)
  }, [])

  /** Surfaces a stream that dies mid-session (device unplugged, permission revoked, tab backgrounded). */
  const monitorStream = useCallback((stream: MediaStream, attempt: number) => {
    const onTrackEnded = () => {
      if (cameraAttemptRef.current !== attempt || streamRef.current !== stream) return
      streamRef.current = null
      setCameraState('error')
      setCameraMessage('The camera stopped while in use. Start it again, or use image upload.')
    }
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', onTrackEnded))
  }, [])

  const beginCamera = useCallback(async () => {
    const attempt = cameraAttemptRef.current + 1
    cameraAttemptRef.current = attempt
    setCameraMessage('')

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      setCameraMessage(cameraUnsupportedMessage())
      return
    }

    // Never hold two devices at once: stop a previous stream before requesting a new one.
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    setCameraState('starting')
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })

      // The user navigated away or started another attempt while the permission prompt was open.
      // Without this guard the stream is adopted by nothing and the camera light stays on forever.
      if (cameraAttemptRef.current !== attempt) {
        mediaStream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = mediaStream
      monitorStream(mediaStream, attempt)
      // Bind before flipping to 'ready' so the first painted frame is already the live preview.
      // play() is deliberately not awaited: the element is still display:none at this point, and a
      // rejection there must not misreport a camera that was acquired successfully.
      attachVideoRef(videoRef.current)
      setCameraState('ready')
    } catch (error) {
      if (cameraAttemptRef.current !== attempt) return
      streamRef.current = null
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraState('denied')
        setCameraMessage(cameraBlockedMessage())
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraState('unavailable')
        setCameraMessage('No camera was found on this device. Use the image upload fallback below.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
        setCameraState('error')
        setCameraMessage('The camera is busy or could not be read. Close other apps using it, then try again or use image upload.')
      } else {
        setCameraState('error')
        setCameraMessage('The camera could not be started. Check browser permissions or use image upload.')
      }
    }
  }, [attachVideoRef, monitorStream])

  /** Records that the camera was live, then releases it because we are leaving the capture step. */
  const leaveCaptureStep = () => {
    resumeCameraRef.current = Boolean(streamRef.current)
    releaseCamera()
  }

  /**
   * Resumes the camera when returning to the capture step after it had been working. Permission is
   * already granted at that point, so the browser does not prompt a second time.
   */
  const enterCaptureStep = () => {
    if (!resumeCameraRef.current || streamRef.current) return
    resumeCameraRef.current = false
    void beginCamera()
  }

  // Step transitions are driven by the navigation handlers below instead of watching `step` in an
  // effect, so camera state is only ever updated from a user event and never during commit. This
  // effect is just the unmount safety net that guarantees the device is not left running.
  useEffect(() => () => stopTracks(), [stopTracks])

  // Re-asserts playback once the preview is actually visible; the element is display:none until ready.
  useEffect(() => {
    if (cameraState === 'ready' && step === 1) attachVideoRef(videoRef.current)
  }, [attachVideoRef, cameraState, step])

  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const rememberUrl = (url: string) => objectUrlsRef.current.add(url)

  const discardDraftUrl = (draft: ImageDraft) => {
    URL.revokeObjectURL(draft.previewUrl)
    objectUrlsRef.current.delete(draft.previewUrl)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const stream = streamRef.current

    // Never fail silently. A dead preview used to leave an enabled "Capture photo" button that
    // returned without a word, and the enable control is hidden while the state reads 'ready',
    // so there was no recovery path at all short of reloading the page.
    if (!video || !stream || cameraState !== 'ready' || video.videoWidth === 0 || video.videoHeight === 0 || !stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      releaseCamera()
      setCameraState('idle')
      setCameraMessage('The camera preview is not live. Start the camera again, or use image upload.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraMessage('This browser could not create a capture surface. Use image upload instead.')
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraMessage('The photo could not be captured. Please try again.')
        return
      }
      const file = new File([blob], `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' })
      const draft = createDraft(file, 'camera', selectedLabel)
      rememberUrl(draft.previewUrl)
      // Revoking inside a state updater is a side effect in a reducer: StrictMode invokes updaters
      // twice and React may discard an update entirely, which would revoke a URL still on screen.
      if (pendingCapture) discardDraftUrl(pendingCapture)
      setPendingCapture(draft)
    }, 'image/jpeg', 0.92)
  }

  const usePendingCapture = () => {
    if (!pendingCapture) return
    setImages((current) => [...current, pendingCapture])
    setPendingCapture(null)
  }

  const retakeCapture = () => {
    if (pendingCapture) discardDraftUrl(pendingCapture)
    setPendingCapture(null)
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    const remaining = Math.max(0, 10 - images.length)
    const accepted = files.filter((file) => ALLOWED_IMAGE_TYPES.has(file.type) && file.size <= 8 * 1024 * 1024).slice(0, remaining)
    if (accepted.length !== files.length) setFormError('Only image files up to 8 MB each can be added, with a maximum of 10 images.')
    const drafts = accepted.map((file) => {
      const draft = createDraft(file, 'upload', selectedLabel)
      rememberUrl(draft.previewUrl)
      return draft
    })
    setImages((current) => [...current, ...drafts])
  }

  const removeImage = (id: string) => {
    const target = images.find((image) => image.id === id)
    setImages((current) => current.filter((image) => image.id !== id))
    // Kept out of the updater for the same StrictMode/discard reason as the capture above.
    if (target) discardDraftUrl(target)
  }

  const moveImage = (index: number, direction: -1 | 1) => {
    setImages((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  const updateImageLabel = (id: string, label: ImageLabel) => setImages((current) => current.map((image) => image.id === id ? { ...image, label } : image))

  const continueToCapture = () => {
    setFormError('')
    if (!product.name.trim()) {
      setFormError('Add the product name before continuing.')
      return
    }
    setStep(1)
    enterCaptureStep()
  }

  const continueToReview = () => {
    setFormError('')
    if (pendingCapture) {
      setFormError('Choose “Use photo” or “Retake” for the captured image before continuing.')
      return
    }
    if (images.length === 0) {
      setFormError('Add at least one package image before continuing.')
      return
    }
    leaveCaptureStep()
    setStep(2)
  }

  const goBack = () => {
    setFormError('')
    // `step` is the step being left, so this releases the camera on the way out of capture and
    // resumes it on the way back in from review.
    if (step === 1) leaveCaptureStep()
    setStep((current) => Math.max(0, current - 1))
    if (step === 2) enterCaptureStep()
  }

  const saveInspection = async () => {
    setSaveError('')
    setSaving(true)
    const formData = new FormData()
    formData.append('product', JSON.stringify(product))
    formData.append('imageMetadata', JSON.stringify(images.map((image, index) => ({ label: image.label, source: image.source, sortOrder: index }))))
    images.forEach((image) => formData.append('images', image.file, image.file.name))

    try {
      const response = await fetch('/api/inspections', { method: 'POST', body: formData })
      const data = (await response.json()) as SavedInspection & { error?: string }
      if (!response.ok) throw new Error(data.error || 'The inspection could not be saved.')
      stopCamera()
      setSaved(data)
      setStep(3)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The inspection could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const resetWorkflow = () => {
    images.forEach(discardDraftUrl)
    if (pendingCapture) discardDraftUrl(pendingCapture)
    stopCamera()
    setProduct(initialProduct)
    setImages([])
    setPendingCapture(null)
    setSaved(null)
    setSaveError('')
    setFormError('')
    setSelectedLabel('front')
    setStep(0)
  }

  if (saved) {
    return <SavedState saved={saved} onStartAnother={resetWorkflow} />
  }

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/app" className="focus-ring inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-ink"><ArrowLeft size={14} /> Dashboard</Link>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-ink">New inspection</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Create a product record, capture the package from every useful angle, review the evidence, then save one traceable inspection.</p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] font-medium text-muted sm:self-auto"><ShieldCheck size={14} className="text-moss" /> Evidence-first capture</span>
      </div>

      <div className="surface mt-8 p-4 sm:p-6 lg:p-8">
        <Stepper currentStep={step} />
        <div className="mt-8">
          {step === 0 ? <ProductStep product={product} updateProduct={updateProduct} /> : null}
          {step === 1 ? <CaptureStep cameraState={cameraState} cameraMessage={cameraMessage} beginCamera={beginCamera} stopCamera={stopCamera} videoRef={attachVideoRef} selectedLabel={selectedLabel} setSelectedLabel={setSelectedLabel} capturePhoto={capturePhoto} pendingCapture={pendingCapture} usePendingCapture={usePendingCapture} retakeCapture={retakeCapture} fileInputRef={fileInputRef} handleUpload={handleUpload} images={images} updateImageLabel={updateImageLabel} removeImage={removeImage} moveImage={moveImage} /> : null}
          {step === 2 ? <ReviewStep product={product} images={images} updateImageLabel={updateImageLabel} removeImage={removeImage} moveImage={moveImage} /> : null}
          {formError ? <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" />{formError}</div> : null}
          {saveError ? <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" />{saveError}</div> : null}
        </div>
        <div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
          <button type="button" onClick={goBack} disabled={step === 0 || saving} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-[#efede7] hover:text-ink disabled:pointer-events-none disabled:opacity-40"><ChevronLeft size={17} /> Back</button>
          {step === 0 ? <button type="button" onClick={continueToCapture} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-moss px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174a37]">Continue to capture <ArrowRight size={16} /></button> : null}
          {step === 1 ? <button type="button" onClick={continueToReview} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-moss px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174a37]">Review inspection <ArrowRight size={16} /></button> : null}
          {step === 2 ? <button type="button" onClick={saveInspection} disabled={saving} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-moss px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174a37] disabled:cursor-wait disabled:opacity-60">{saving ? <><LoaderCircle size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save inspection</>}</button> : null}
        </div>
      </div>
    </div>
  )
}

function ProductStep({ product, updateProduct }: { product: ProductDraft; updateProduct: (key: keyof ProductDraft, value: string) => void }) {
  return <div><div className="max-w-2xl"><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Step 1 · Product information</p><h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink">Tell us what is being inspected.</h3><p className="mt-2 text-sm leading-6 text-muted">Enter the information available on the package. You can add more context later without inventing missing values.</p></div><div className="mt-8 grid gap-5 sm:grid-cols-2"><Field label="Product name" required value={product.name} onChange={(value) => updateProduct('name', value)} placeholder="e.g. Packaged commodity name" /><Field label="Brand" value={product.brand} onChange={(value) => updateProduct('brand', value)} placeholder="Brand printed on package" /><Field label="Manufacturer / packer" value={product.manufacturer} onChange={(value) => updateProduct('manufacturer', value)} placeholder="Name as printed" /><Field label="Category" value={product.category} onChange={(value) => updateProduct('category', value)} placeholder="Product category" /><Field label="Pack size" value={product.packSize} onChange={(value) => updateProduct('packSize', value)} placeholder="e.g. 500" /><Field label="Unit" value={product.unit} onChange={(value) => updateProduct('unit', value)} placeholder="e.g. g, kg, ml" /><Field label="Batch / lot number" value={product.batchNumber} onChange={(value) => updateProduct('batchNumber', value)} placeholder="If visible on package" /><Field label="Declared retail price" type="number" value={product.declaredRetailPrice} onChange={(value) => updateProduct('declaredRetailPrice', value)} placeholder="Optional" help="Numbers only; leave blank when not available." /></div><label className="mt-5 block"><span className="mb-2 block text-xs font-semibold text-ink">Online product / listing URL</span><input type="url" value={product.onlineListingUrl} onChange={(event) => updateProduct('onlineListingUrl', event.target.value)} placeholder="https://marketplace.example/product" className="focus-ring h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-sm text-ink outline-none transition placeholder:text-[#aaa79e] focus:border-moss" /><span className="mt-1.5 block text-[11px] leading-4 text-muted">Optional. The server retrieves the listing after the inspection is saved; selling price is not treated as MRP unless the listing explicitly labels an MRP.</span></label><div className="mt-6 flex gap-3 rounded-2xl border border-line bg-[#efede7] p-4 text-xs leading-5 text-muted"><Info size={16} className="mt-0.5 shrink-0 text-moss" />Only the product name is required to continue. All other fields are optional and are saved exactly as entered.</div></div>
}

function CameraPanel({ cameraState, cameraMessage, beginCamera, stopCamera, videoRef, capturePhoto }: { cameraState: CameraState; cameraMessage: string; beginCamera: () => void; stopCamera: () => void; videoRef: (node: HTMLVideoElement | null) => void; capturePhoto: () => void }) {
  const ready = cameraState === 'ready'
  return <div className="overflow-hidden rounded-2xl border border-line bg-ink"><div className="relative aspect-[4/3] min-h-[260px] overflow-hidden bg-[#17231d] sm:min-h-[360px]"><video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover ${ready ? 'block' : 'hidden'}`} aria-label="Live camera preview" />{!ready ? <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/10 text-amber">{cameraState === 'starting' ? <LoaderCircle size={25} className="animate-spin" /> : cameraState === 'unavailable' ? <VideoOff size={25} /> : <Camera size={25} />}</span><p className="mt-4 text-sm font-semibold">{cameraState === 'starting' ? 'Starting camera…' : cameraState === 'denied' ? 'Camera permission needed' : cameraState === 'unavailable' ? 'Camera unavailable' : 'Camera is off'}</p><p className="mt-2 max-w-xs text-xs leading-5 text-white/55">{cameraMessage || 'Use your device camera to capture package evidence.'}</p>{cameraState !== 'starting' && cameraState !== 'unavailable' ? <button type="button" onClick={beginCamera} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#e69d47]"><Camera size={15} /> {cameraState === 'denied' || cameraState === 'error' ? 'Try camera again' : 'Enable camera'}</button> : null}</div> : null}</div><div className="flex items-center justify-between gap-3 border-t border-white/10 bg-ink px-4 py-3"><p className="text-[11px] text-white/50">{ready ? 'Live preview active' : 'Camera preview'}</p><div className="flex items-center gap-2">{ready ? <button type="button" onClick={stopCamera} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"><VideoOff size={15} /> Turn off</button> : null}<button type="button" onClick={capturePhoto} disabled={!ready} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:bg-[#f2f0eb] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"><Camera size={15} /> Capture photo</button></div></div></div>
}

function CaptureStep({ cameraState, cameraMessage, beginCamera, stopCamera, videoRef, selectedLabel, setSelectedLabel, capturePhoto, pendingCapture, usePendingCapture, retakeCapture, fileInputRef, handleUpload, images, updateImageLabel, removeImage, moveImage }: { cameraState: CameraState; cameraMessage: string; beginCamera: () => void; stopCamera: () => void; videoRef: (node: HTMLVideoElement | null) => void; selectedLabel: ImageLabel; setSelectedLabel: (label: ImageLabel) => void; capturePhoto: () => void; pendingCapture: ImageDraft | null; usePendingCapture: () => void; retakeCapture: () => void; fileInputRef: React.RefObject<HTMLInputElement | null>; handleUpload: (event: ChangeEvent<HTMLInputElement>) => void; images: ImageDraft[]; updateImageLabel: (id: string, label: ImageLabel) => void; removeImage: (id: string) => void; moveImage: (index: number, direction: -1 | 1) => void }) {
  return <div><div className="max-w-2xl"><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-moss" />Step 2 · Capture images</p><h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink">Capture the package from useful angles.</h3><p className="mt-2 text-sm leading-6 text-muted">Choose a label before you capture or upload. You can change labels, reorder, or remove images before saving.</p></div><div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-[#efede7] p-3"><span className="mr-1 text-xs font-semibold text-ink">Next image:</span>{IMAGE_LABELS.map((label) => <button key={label} type="button" onClick={() => setSelectedLabel(label)} className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedLabel === label ? 'bg-moss text-white' : 'text-muted hover:bg-white hover:text-ink'}`}>{labelTitle(label)}</button>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]"><div><CameraPanel cameraState={cameraState} cameraMessage={cameraMessage} beginCamera={beginCamera} stopCamera={stopCamera} videoRef={videoRef} capturePhoto={capturePhoto} />{pendingCapture ? <div className="mt-4 rounded-2xl border border-amber/30 bg-amber-soft p-4"><div className="flex items-start gap-3"><img src={pendingCapture.previewUrl} alt="Pending camera capture" className="h-20 w-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">Use this photo?</p><p className="mt-1 text-xs text-muted">It will be added as the {labelTitle(pendingCapture.label).toLowerCase()} image.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={usePendingCapture} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-moss px-3 py-2 text-xs font-semibold text-white hover:bg-[#174a37]"><Check size={14} /> Use photo</button><button type="button" onClick={retakeCapture} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-white"><RotateCcw size={14} /> Retake</button></div></div></div></div> : null}<div className="mt-4 rounded-2xl border border-dashed border-line bg-paper p-5 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-leaf text-moss"><Upload size={18} /></span><p className="mt-3 text-sm font-semibold text-ink">Camera not available?</p><p className="mt-1 text-xs leading-5 text-muted">Upload one or more package images instead. Uploads use the same inspection image structure as camera captures.</p><input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" /><button type="button" onClick={() => fileInputRef.current?.click()} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-moss/30 hover:bg-white"><ImagePlus size={15} /> Choose image files</button></div></div><div><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Package images</p><p className="mt-1 text-xs text-muted">{images.length} of 10 added</p></div>{images.length > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full border border-leaf bg-leaf/60 px-2.5 py-1 text-[10px] font-semibold text-moss"><Check size={12} /> Ready to review</span> : null}</div>{images.length === 0 ? <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-paper px-6 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#efede7] text-muted"><FileImage size={22} /></span><p className="mt-4 text-sm font-semibold text-ink">No images added</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted">Capture or upload the front, back, side, top, or bottom of the package.</p></div> : <div className="space-y-3">{images.map((image, index) => <ImageDraftCard key={image.id} image={image} index={index} total={images.length} updateImageLabel={updateImageLabel} removeImage={removeImage} moveImage={moveImage} />)}</div>}</div></div></div>
}

function ImageDraftCard({ image, index, total, updateImageLabel, removeImage, moveImage }: { image: ImageDraft; index: number; total: number; updateImageLabel: (id: string, label: ImageLabel) => void; removeImage: (id: string) => void; moveImage: (index: number, direction: -1 | 1) => void }) {
  return <div className="flex gap-3 rounded-2xl border border-line bg-paper p-3"><img src={image.previewUrl} alt={`${labelTitle(image.label)} package view`} className="h-20 w-20 shrink-0 rounded-xl bg-[#efede7] object-cover" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-ink">Image {index + 1}</p><p className="mt-1 truncate text-[11px] text-muted">{image.source === 'camera' ? 'Camera capture' : image.file.name}</p></div><button type="button" onClick={() => removeImage(image.id)} className="focus-ring rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger" aria-label={`Remove image ${index + 1}`}><Trash2 size={15} /></button></div><div className="mt-3 flex items-center justify-between gap-2"><label className="flex min-w-0 flex-1 items-center gap-2"><span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Label</span><span className="relative min-w-0 flex-1"><select value={image.label} onChange={(event) => updateImageLabel(image.id, event.target.value as ImageLabel)} className="focus-ring h-8 w-full appearance-none rounded-lg border border-line bg-canvas pl-2.5 pr-7 text-xs font-medium text-ink outline-none focus:border-moss">{IMAGE_LABELS.map((label) => <option key={label} value={label}>{labelTitle(label)}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-2 top-2 text-muted" /></span></label><div className="flex shrink-0 items-center gap-1"><button type="button" disabled={index === 0} onClick={() => moveImage(index, -1)} className="focus-ring rounded-lg border border-line p-1.5 text-muted hover:bg-canvas disabled:opacity-30" aria-label="Move image up"><ChevronUp size={14} /></button><button type="button" disabled={index === total - 1} onClick={() => moveImage(index, 1)} className="focus-ring rounded-lg border border-line p-1.5 text-muted hover:bg-canvas disabled:opacity-30" aria-label="Move image down"><ChevronDown size={14} /></button></div></div></div></div>
}

function ReviewStep({ product, images, updateImageLabel, removeImage, moveImage }: { product: ProductDraft; images: ImageDraft[]; updateImageLabel: (id: string, label: ImageLabel) => void; removeImage: (id: string) => void; moveImage: (index: number, direction: -1 | 1) => void }) {
  return <div><div className="max-w-2xl"><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Step 3 · Review</p><h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink">Review before saving.</h3><p className="mt-2 text-sm leading-6 text-muted">Confirm the product information and image order. Saving creates one Product, one Inspection, and one InspectionImage document per image.</p></div><div className="mt-7 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]"><div className="surface p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink">Product information</p><span className="rounded-full bg-leaf px-2.5 py-1 text-[10px] font-semibold text-moss">Ready</span></div><dl className="mt-5 space-y-3">{[['Name', product.name], ['Brand', product.brand], ['Manufacturer', product.manufacturer], ['Category', product.category], ['Pack size', product.packSize && product.unit ? `${product.packSize} ${product.unit}` : product.packSize || product.unit], ['Batch / lot', product.batchNumber], ['Declared price', product.declaredRetailPrice], ['Online listing URL', product.onlineListingUrl]].map(([label, value]) => value ? <div key={label} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"><dt className="text-xs text-muted">{label}</dt><dd className="max-w-[58%] text-right text-xs font-semibold text-ink">{value}</dd></div> : null)}</dl></div><div><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-ink">Images · {images.length}</p><span className="text-xs text-muted">Order and labels can still be changed</span></div><div className="space-y-3">{images.map((image, index) => <ImageDraftCard key={image.id} image={image} index={index} total={images.length} updateImageLabel={updateImageLabel} removeImage={removeImage} moveImage={moveImage} />)}</div></div></div><div className="mt-6 flex gap-3 rounded-2xl border border-leaf bg-leaf/50 p-4 text-xs leading-5 text-[#4f6e5c]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-moss" />The capture source is preserved for every image. Camera and uploaded files use the same stored image document structure.</div></div>
}

function SavedState({ saved, onStartAnother }: { saved: SavedInspection; onStartAnother: () => void }) {
  return <div><div className="max-w-2xl"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-leaf text-moss"><Check size={23} strokeWidth={2.5} /></span><p className="eyebrow mt-6"><span className="h-1.5 w-1.5 rounded-full bg-moss" />Inspection saved</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">The inspection is now in your workspace.</h2><p className="mt-3 text-sm leading-6 text-muted">Product and inspection records were created, and each package image was stored with its label, source, and order.</p></div><div className="mt-8 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><div className="surface p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Saved record</p><dl className="mt-5 space-y-4"><div><dt className="text-xs text-muted">Product</dt><dd className="mt-1 text-sm font-semibold text-ink">{saved.product.name}</dd></div><div><dt className="text-xs text-muted">Inspection ID</dt><dd className="mt-1 break-all font-mono text-[11px] text-ink">{saved.inspection.id}</dd></div><div><dt className="text-xs text-muted">Images stored</dt><dd className="mt-1 text-sm font-semibold text-ink">{saved.inspection.imageCount}</dd></div><div><dt className="text-xs text-muted">Status</dt><dd className="mt-1 inline-flex rounded-full bg-amber-soft px-2.5 py-1 text-xs font-semibold capitalize text-amber">{saved.inspection.status}</dd></div></dl><div className="mt-6 flex flex-wrap gap-2"><Link href="/app/inspections" className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#174a37]">View inspections <ArrowRight size={14} /></Link><button type="button" onClick={onStartAnother} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-ink hover:bg-[#efede7]"><RotateCcw size={14} /> New inspection</button></div></div><div className="surface p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Stored package images</p><p className="mt-1 text-xs text-muted">Loaded from the saved InspectionImage records</p></div><FileImage size={18} className="text-moss" /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{saved.images.map((image) => <div key={image.id} className="overflow-hidden rounded-xl border border-line bg-canvas"><img src={image.url} alt={`${labelTitle(image.label)} package view`} className="aspect-square w-full object-cover" /><div className="flex items-center justify-between gap-2 p-2.5"><span className="text-[11px] font-semibold text-ink">{labelTitle(image.label)}</span><span className="text-[10px] capitalize text-muted">{image.source}</span></div></div>)}</div></div></div><div className="mt-5"><AnalysisViewer inspectionId={saved.inspection.id} canAnalyze /></div><div className="mt-5"><ComplianceViewer inspectionId={saved.inspection.id} canEvaluate /></div></div>
}
