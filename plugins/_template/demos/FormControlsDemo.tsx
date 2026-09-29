import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.TextBox (single-line) / Checkbox / RadioGroup / Toggle / RangeSlider. */
export function FormControlsDemo({ api }: { api: PluginApi }) {
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(false);
  const [radioValue, setRadioValue] = useState("a");
  const [toggled, setToggled] = useState(false);
  const [rangeValue, setRangeValue] = useState(50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <api.ui.TextBox singleLine value={name} onChange={setName} placeholder="Single-line, non-resizable" />
      <api.ui.Checkbox checked={checked} onChange={setChecked} label="Enable feature" />
      <api.ui.RadioGroup
        value={radioValue}
        onChange={setRadioValue}
        options={[
          { label: "Option A", value: "a" },
          { label: "Option B", value: "b" },
          { label: "Option C", value: "c" },
        ]}
      />
      <api.ui.Toggle checked={toggled} onChange={setToggled} label="Background sync" />
      <label>
        Volume: {rangeValue}
        <api.ui.RangeSlider value={rangeValue} onChange={setRangeValue} min={0} max={100} />
      </label>
    </div>
  );
}
