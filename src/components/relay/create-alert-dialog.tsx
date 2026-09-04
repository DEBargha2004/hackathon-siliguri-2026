import React, { useState, useRef } from "react";
import {
  Upload,
  Camera,
  X,
  AlertTriangle,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HazardType, AlertSeverity, OfficialAlert } from "@/types/alert";
import { createOfficialAlertFromUpload } from "@/lib/relay/alert-store";

export interface CreateAlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (alert: OfficialAlert) => void;
}

export const CreateAlertDialog: React.FC<CreateAlertDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [hazardType, setHazardType] = useState<HazardType>("LANDSLIDE_SLIP");
  const [severity, setSeverity] = useState<AlertSeverity>("CRITICAL");
  const [locationName, setLocationName] = useState<string>("Tindharia Corridor - km 28");
  const [message, setMessage] = useState<string>(
    "EMERGENCY ORDER: Active slope deformation and debris blocking railway tracks. Traffic suspended until clearance."
  );
  const [coordsStr, setCoordsStr] = useState<string>("26.8524, 88.3276");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg("Please select or upload an evidence photo.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let coordinates: [number, number] | undefined = undefined;
      if (coordsStr.trim()) {
        const parts = coordsStr.split(",").map((s) => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          coordinates = [parts[0], parts[1]];
        }
      }

      const fullMessage = `${message.trim()} [Location: ${locationName.trim()}]`;

      const alert = await createOfficialAlertFromUpload(selectedFile, {
        hazardType,
        severity,
        message: fullMessage,
        coordinates,
      });

      onCreated(alert);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create alert";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Create Official Alert from Upload</h3>
              <p className="text-[10px] text-muted-foreground">
                Upload custom slope evidence photo & broadcast locally
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive flex items-center gap-2 text-[11px]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Photo Upload Box */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-emerald-600" />
              Evidence Photo <span className="text-destructive">*</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {previewUrl ? (
              <div className="relative h-44 w-full rounded-xl overflow-hidden border border-border bg-black/90 group">
                <img
                  src={previewUrl}
                  alt="Uploaded preview"
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full text-xs shadow-md"
                  >
                    Change Photo
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-border hover:border-emerald-500/60 rounded-xl p-6 text-center space-y-2 bg-muted/20 transition-colors"
              >
                <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Click to upload photo</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    JPEG, PNG, or WebP from camera or device files
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Hazard Type & Severity Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Hazard Type</label>
              <select
                value={hazardType}
                onChange={(e) => setHazardType(e.target.value as HazardType)}
                className="w-full rounded-xl border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="LANDSLIDE_SLIP">LANDSLIDE SLIP</option>
                <option value="TRACK_ROAD_BLOCKAGE">TRACK / ROAD BLOCKAGE</option>
                <option value="WATER_SEEPAGE">WATER SEEPAGE</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Severity Level</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
                className="w-full rounded-xl border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="CRITICAL">CRITICAL (Red)</option>
                <option value="WARNING">WARNING (Amber)</option>
                <option value="MONITOR">MONITOR (Blue)</option>
              </select>
            </div>
          </div>

          {/* Location / Landmark */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3 text-emerald-600" />
              Corridor Location / Landmark
            </label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Tindharia km 28 or Paglajhora"
              className="w-full rounded-xl border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Official Directive Message */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              Official Directive & Instructions
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Enter official hazard instructions..."
              className="w-full rounded-xl border border-border bg-background p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Coordinates */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground text-[11px] text-muted-foreground">
              GPS Coordinates (Latitude, Longitude)
            </label>
            <input
              type="text"
              value={coordsStr}
              onChange={(e) => setCoordsStr(e.target.value)}
              placeholder="26.8524, 88.3276"
              className="w-full rounded-xl border border-border bg-background p-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedFile}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs gap-1.5 shadow-md"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isSubmitting ? "Creating..." : "Create Official Alert"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
