import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  resolveBrand, BRAND_FONTS, contrast, parseHex, AA_TEXT,
  type BrandIntent,
} from '@/lib/brand/tokens';

/**
 * The brand studio.
 *
 * A ministry sets this once and it reaches every surface — the staff app, the
 * member portal, the public application form, its own site, the invitation a
 * household opens. That reach is the whole point: the version where a ministry
 * restyles five things separately is the version where four stay wrong.
 *
 * Two decisions make this feel different from a settings form.
 *
 * **The preview is live and it is real.** The same `resolveBrand` the server
 * uses runs here on every keystroke, so what a ministry sees while choosing is
 * exactly what ships. A preview computed differently from production is a lie
 * that gets discovered by a member.
 *
 * **Contrast problems are shown, not hidden.** A ministry that picks a pale
 * yellow gets a deeper yellow for text, and is told so in plain words. Silently
 * overriding somebody's brand feels broken; explaining what you changed and why
 * feels careful — and it is the difference between a design system and a colour
 * picker.
 */

const PRESETS: { label: string; primary: string; note: string }[] = [
  { label: 'Evergreen', primary: '#0f766e', note: 'Calm and clinical without being cold.' },
  { label: 'Deep blue', primary: '#1d4ed8', note: 'The most conventional choice, and it never looks wrong.' },
  { label: 'Claret', primary: '#9f1239', note: 'Warm and traditional. Reads as an institution.' },
  { label: 'Slate', primary: '#334155', note: 'Almost neutral. Lets photographs carry the colour.' },
  { label: 'Ochre', primary: '#a16207', note: 'Earthy and unusual — distinctive without shouting.' },
  { label: 'Plum', primary: '#6b21a8', note: 'Modern. Stands out in a category that mostly uses blue.' },
];

export function BrandStudio({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'org'], queryFn: () => api.admin.org() });

  const [intent, setIntent] = useState<BrandIntent>({ primary: '#0f766e', font: 'inter', radius: 8 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.org) return;
    const brand = (data.org.brand ?? {}) as Partial<BrandIntent>;
    setIntent({
      primary: brand.primary ?? '#0f766e',
      accent: brand.accent,
      font: brand.font ?? 'inter',
      radius: brand.radius ?? 8,
      wordmark: brand.wordmark ?? '',
    });
  }, [data?.org]);

  // The same function the server runs. Recomputed on every keystroke, which is
  // cheap because it is pure arithmetic over six numbers.
  const resolved = useMemo(() => resolveBrand(intent), [intent]);

  async function save() {
    setError(null);
    try {
      await api.admin.updateOrg({
        brand: { ...(data?.org.brand ?? {}), ...intent },
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'org'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    }
  }

  const p = resolved.palette;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Your colour</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setIntent({ ...intent, primary: preset.primary })}
                  title={preset.note}
                  className="flex items-center gap-2 rounded-md border p-2 text-left text-sm hover:border-primary/50 disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 rounded"
                    style={{ background: preset.primary }}
                  />
                  <span className="truncate">{preset.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="brand-colour">Or your own</Label>
                <input
                  id="brand-colour"
                  type="color"
                  value={parseHex(intent.primary) ? intent.primary : '#0f766e'}
                  onChange={(e) => setIntent({ ...intent, primary: e.target.value })}
                  disabled={!canEdit}
                  className="h-10 w-16 cursor-pointer rounded border bg-background disabled:opacity-60"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="brand-hex">Hex</Label>
                <Input
                  id="brand-hex"
                  value={intent.primary}
                  onChange={(e) => setIntent({ ...intent, primary: e.target.value })}
                  disabled={!canEdit}
                  className="font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle>Type and shape</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {BRAND_FONTS.map((font) => (
                <label
                  key={font.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm hover:border-primary/50"
                >
                  <input
                    type="radio"
                    name="brand-font"
                    checked={intent.font === font.value}
                    onChange={() => setIntent({ ...intent, font: font.value })}
                    disabled={!canEdit}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium" style={{ fontFamily: font.stack }}>{font.label}</span>
                    <span className="block text-xs text-muted-foreground">{font.note}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-radius">Corner rounding — {p.radius}px</Label>
              <input
                id="brand-radius"
                type="range"
                min={0}
                max={24}
                value={p.radius}
                onChange={(e) => setIntent({ ...intent, radius: Number(e.target.value) })}
                disabled={!canEdit}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-wordmark">Wordmark</Label>
              <Input
                id="brand-wordmark"
                value={intent.wordmark ?? ''}
                onChange={(e) => setIntent({ ...intent, wordmark: e.target.value })}
                placeholder="Shown instead of “Auxilium”"
                disabled={!canEdit}
              />
            </div>
          </CardContent>
        </Card>

        {/* Never silent. */}
        {!resolved.clean && (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 pt-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                We adjusted something so it stays readable
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {resolved.adjustments.map((a) => (
                  <li key={a.token}>
                    {a.reason}
                    <span className="ml-1 font-mono text-xs">
                      {a.requested} → {a.applied}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {resolved.clean && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary" />
            Everything here clears the contrast standard as chosen.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={save}>Save brand</Button>
            {saved && <span className="text-sm text-muted-foreground">Saved everywhere.</span>}
          </div>
        )}
      </div>

      <BrandPreview palette={p} wordmark={intent.wordmark} />
    </div>
  );
}

/**
 * What it actually looks like.
 *
 * Deliberately shows a member-facing surface rather than swatches. A row of
 * colour chips tells a ministry nothing about whether their brand works; a
 * declined bill and a button do. This is also the screen the brand matters most
 * on — the one somebody opens on a bad day.
 */
function BrandPreview({
  palette,
  wordmark,
}: {
  palette: ReturnType<typeof resolveBrand>['palette'];
  wordmark?: string;
}) {
  const ratio = useMemo(() => {
    const fg = parseHex(palette.onSurfaceMuted);
    const bg = parseHex(palette.surface);
    return fg && bg ? contrast(fg, bg) : 0;
  }, [palette]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        What a member sees
      </p>

      <div
        className="overflow-hidden border"
        style={{
          background: palette.surface,
          color: palette.onSurface,
          fontFamily: palette.font,
          borderRadius: palette.radius,
          borderColor: palette.border,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${palette.border}` }}
        >
          <span className="font-semibold">{wordmark || 'Your ministry'}</span>
          <span style={{ color: palette.onSurfaceMuted, fontSize: 13 }}>Your bills</span>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <p className="font-semibold" style={{ fontSize: 18 }}>Emergency admission</p>
            <p style={{ color: palette.onSurfaceMuted, fontSize: 13 }}>
              $14,280 · submitted 12 June
            </p>
          </div>

          <div
            className="p-3"
            style={{ background: palette.primarySoft, borderRadius: palette.radius }}
          >
            <p style={{ fontSize: 13 }}>
              A case owner is reviewing this now. Your ministry’s commitment for this bill is
              29 June.
            </p>
          </div>

          <p style={{ color: palette.onSurfaceMuted, fontSize: 13 }}>
            Appealing a declined need succeeds about half the time, and almost nobody tries.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <span
              className="inline-flex items-center px-3 py-2 text-sm font-medium"
              style={{
                background: palette.primary,
                color: palette.onPrimary,
                borderRadius: palette.radius,
              }}
            >
              Read your rights
            </span>
            <span
              className="inline-flex items-center px-3 py-2 text-sm font-medium"
              style={{
                border: `1px solid ${palette.border}`,
                color: palette.primary,
                borderRadius: palette.radius,
              }}
            >
              Ask a question
            </span>
          </div>
        </div>
      </div>

      {/* The number, not just a tick. A ministry that can see 5.2:1 can argue
          with it; one shown a green tick has to trust us. */}
      <p className="text-xs text-muted-foreground">
        Secondary text contrast {ratio.toFixed(1)}:1 — the standard for body text is{' '}
        {AA_TEXT}:1.
      </p>
    </div>
  );
}
