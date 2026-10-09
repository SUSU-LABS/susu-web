```typescript
import React, { useId } from 'react';

export const Field = ({ id, name, label, ...props }) => {
  const generatedId = useId();
  const fieldId = id ?? name ?? `${label.toLowerCase().replace(/\s+/g, '-')}-${generatedId}`;

  return (
    <div>
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} name={name} {...props} />
    </div>
  );
};

export const SelectField = ({ id, name, label, options, ...props }) => {
  const generatedId = useId();
  const fieldId = id ?? name ?? `${label.toLowerCase().replace(/\s+/g, '-')}-${generatedId}`;

  return (
    <div>
      <label htmlFor={fieldId}>{label}</label>
      <select id={fieldId} name={name} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
