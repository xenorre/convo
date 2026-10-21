interface ChoiceGroupProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

// Native radios keep arrow-key navigation; labels reuse the Chats/Friends switch look.
function ChoiceGroup<T extends string>({ legend, name, value, options, disabled, onChange }: ChoiceGroupProps<T>) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex gap-1 rounded-xl border border-slate-700/50 bg-slate-900/50 p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-center text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-slate-200 has-checked:bg-cyan-500/15 has-checked:text-cyan-300 has-checked:shadow-sm has-checked:ring-1 has-checked:ring-inset has-checked:ring-cyan-400/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cyan-400 has-disabled:cursor-not-allowed has-disabled:opacity-60"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default ChoiceGroup;
