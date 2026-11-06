import { DEFAULT_POST } from '../../core/defaults';
import { useStore } from '../../core/store';
import type { PostSettings } from '../../core/types';
import { ColorField, Row, Section, Segmented } from '../controls/basic';
import { NumberControl } from '../controls/NumberControl';
import { IconReset } from '../icons';

export function SceneInspector() {
  const post = useStore((s) => s.post);
  const setPost = useStore.getState().setPost;
  return (
    <>
      <Section
        title="Stage"
        storageKey="scene-stage"
        actions={
          <button className="icon-btn icon-btn--xs" onClick={() => setPost({ ...DEFAULT_POST })} data-tip="Reset scene settings" aria-label="Reset scene settings">
            <IconReset size={12} />
          </button>
        }
      >
        <Row label="Background">
          <ColorField value={post.background} onChange={(background) => setPost({ background })} label="Background" />
        </Row>
        <Row label="Aspect">
          <Segmented<PostSettings['aspect']>
            size="sm"
            value={post.aspect}
            options={[
              { value: 'fill', label: 'Fill' },
              { value: '16:9', label: '16:9' },
              { value: '1:1', label: '1:1' },
              { value: '9:16', label: '9:16' },
              { value: '4:3', label: '4:3' },
            ]}
            onChange={(aspect) => setPost({ aspect })}
            ariaLabel="Aspect ratio"
          />
        </Row>
        <NumberControl
          label="Render scale"
          hint="Multiplier on device pixel ratio. Lower is faster."
          value={post.renderScale}
          min={0.5}
          max={2}
          step={0.05}
          unit="×"
          defaultValue={1}
          onChange={(renderScale) => setPost({ renderScale })}
        />
      </Section>
      <Section title="Post effects" storageKey="scene-post">
        <NumberControl label="Trails" hint="Whole-stage persistence: higher = longer smears" value={post.trails} min={0} max={0.99} step={0.01} defaultValue={0} onChange={(trails) => setPost({ trails })} />
        <NumberControl label="Glow" value={post.glow} min={0} max={1} step={0.01} defaultValue={DEFAULT_POST.glow} onChange={(glow) => setPost({ glow })} />
        <NumberControl label="Glow radius" value={post.glowRadius} min={1} max={60} step={0.5} unit="px" defaultValue={DEFAULT_POST.glowRadius} onChange={(glowRadius) => setPost({ glowRadius })} />
        <NumberControl label="Vignette" value={post.vignette} min={0} max={1} step={0.01} defaultValue={DEFAULT_POST.vignette} onChange={(vignette) => setPost({ vignette })} />
        <NumberControl label="Grain" value={post.grain} min={0} max={1} step={0.01} defaultValue={0} onChange={(grain) => setPost({ grain })} />
      </Section>
    </>
  );
}
