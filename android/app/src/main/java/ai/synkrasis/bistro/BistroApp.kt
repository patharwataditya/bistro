package ai.synkrasis.bistro

import android.app.Application

class BistroApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.session.restore()
    }
}
