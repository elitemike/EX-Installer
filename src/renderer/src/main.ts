import Aurelia, { Registration } from 'aurelia'
import { RouterConfiguration } from '@aurelia/router'
import { DialogConfigurationStandard } from '@aurelia/dialog'
import { App } from './app'
import '../../types/ipc' // Window.python / Window.usb type augmentation
import { registerLicense } from '@syncfusion/ej2/base'
import syncfusionLicense from '../../../syncfusion-license.txt?raw'
import './styles.css'

// Services
import { ArduinoCliService } from './services/arduino-cli.service'
import { GitService } from './services/git.service'
import { FileService } from './services/file.service'
import { PreferencesService } from './services/preferences.service'
import { PythonService } from './services/python.service'
import { UsbService } from './services/usb.service'
import { ToastService } from './services/toast.service'

// State
import { InstallerState } from './models/installer-state'
import { ConfigEditorState } from './models/config-editor-state'

// Config editor components
import { MonacoEditorCustomElement } from './components/monaco-editor'
import { RosterEditorCustomElement } from './components/roster-editor'
import { TurnoutEditorCustomElement } from './components/turnout-editor'
import { ConfigHEditorCustomElement } from './components/config-h-editor'
import { FileEditorPanelCustomElement } from './components/file-editor-panel'
import { ConfirmDialog } from './components/confirm-dialog'
import { CompileProgressCustomElement } from './components/compile-progress'

registerLicense(syncfusionLicense)

new Aurelia()
    .register(
        RouterConfiguration.customize({ useUrlFragmentHash: true }),
        DialogConfigurationStandard.customize((settings) => {
            settings.options.modal = true
        }),
        // Register services as singletons
        Registration.singleton(ArduinoCliService, ArduinoCliService),
        Registration.singleton(GitService, GitService),
        Registration.singleton(FileService, FileService),
        Registration.singleton(PreferencesService, PreferencesService),
        Registration.singleton(PythonService, PythonService),
        Registration.singleton(UsbService, UsbService),
        Registration.singleton(ToastService, ToastService),
        Registration.singleton(InstallerState, InstallerState),
        Registration.singleton(ConfigEditorState, ConfigEditorState),
        // Config editor custom elements
        MonacoEditorCustomElement,
        RosterEditorCustomElement,
        TurnoutEditorCustomElement,
        ConfigHEditorCustomElement,
        FileEditorPanelCustomElement,
        ConfirmDialog,
        CompileProgressCustomElement,
    )
    .app(App)
    .start()
