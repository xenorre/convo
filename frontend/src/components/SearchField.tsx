import { SearchIcon, XIcon } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
}

function SearchField({ value, onChange, label, placeholder, autoFocus }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  // Escape clears the query first; only an empty field lets it reach the
  // window listener that closes the open conversation.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && value) {
      event.stopPropagation();
      onChange("");
    }
  };

  return (
    <div className="relative" role="search">
      <SearchIcon className="auth-input-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
        className="auth-input pr-11 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default SearchField;
