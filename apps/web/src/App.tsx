import styles from '@/App.module.css'
import { useAppStore } from '@/store/appStore'

export default function App() {
  const ready = useAppStore((s) => s.ready)

  return (
    <main className={styles.shell}>
      <p className={styles.brand}>BEATLANE</p>
      <p className={styles.meta}>{ready ? 'Scaffold ready' : 'Loading…'}</p>
    </main>
  )
}
