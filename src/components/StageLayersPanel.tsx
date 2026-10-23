import type { StageLayers } from '../lib/render';

interface StageLayersPanelProps {
  layers: StageLayers;
  onSetLayer: (layer: keyof StageLayers, enabled: boolean) => void;
}

const LAYER_OPTIONS: { key: keyof StageLayers; label: string }[] = [
  { key: 'drawFlightPath', label: 'Flight path' },
  { key: 'drawReticle', label: 'Reticle' },
  { key: 'drawMikhail', label: 'Mikhail' },
  { key: 'drawPressLabel', label: 'Press label' },
];

export function StageLayersPanel({ layers, onSetLayer }: StageLayersPanelProps) {
  return (
    <section className="panel panel-layers" aria-labelledby="stage-layers-heading">
      <div className="panel-heading">
        <h2 id="stage-layers-heading">Stage layers</h2>
        <span className="panel-aside">Mikhail starts on</span>
      </div>

      <div className="layer-list">
        {LAYER_OPTIONS.map(({ key, label }) => (
          <label className="layer-row" key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              role="switch"
              checked={layers[key]}
              onChange={(event) => onSetLayer(key, event.currentTarget.checked)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
