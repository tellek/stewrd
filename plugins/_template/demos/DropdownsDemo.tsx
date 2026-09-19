import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";
import ideaIcon from "../assets/idea.png";
import settingsIcon from "../assets/settings.png";

const options = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];

const imageOptions = [
  { label: "Idea", value: "idea", image: ideaIcon },
  { label: "Settings", value: "settings", image: settingsIcon },
];

/** Demonstrates api.ui.Dropdown / DropdownCheckboxes / DropdownRadio /
 * DropdownImageText / DropdownImageGrid. */
export function DropdownsDemo({ api }: { api: PluginApi }) {
  const [single, setSingle] = useState("alpha");
  const [multi, setMulti] = useState<string[]>(["alpha"]);
  const [radio, setRadio] = useState("beta");
  const [imageText, setImageText] = useState("idea");
  const [imageGrid, setImageGrid] = useState("settings");

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <api.ui.Dropdown options={options} value={single} onChange={setSingle} />
      <api.ui.DropdownCheckboxes options={options} values={multi} onChange={setMulti} />
      <api.ui.DropdownRadio options={options} value={radio} onChange={setRadio} />
      <api.ui.DropdownImageText options={imageOptions} value={imageText} onChange={setImageText} />
      <api.ui.DropdownImageGrid options={imageOptions} value={imageGrid} onChange={setImageGrid} />
    </div>
  );
}
