export function NameList({ names }: { names: string[] }) {
  return (
    <ul>
      {names.map((name) => (
        <li>{name}</li>
      ))}
    </ul>
  )
}
