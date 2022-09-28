export function Label(props: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mt-6">
      <div className="font-bold mb-2">{props.label}</div>
      {!!props.description && (
        <p className="text-gray-600 mb-2">
          <small>{props.description}</small>
        </p>
      )}
      <div
        className="[&_input]:w-full [&_input]:border [&_input]:p-2
        [&_textarea]:w-full [&_textarea]:border [&_textarea]:p-2"
      >
        {props.children}
      </div>
    </label>
  );
}