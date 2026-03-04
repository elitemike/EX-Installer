import { IDialogController, IDialogCustomElementViewModel } from '@aurelia/dialog'
import { resolve } from 'aurelia'

interface ConfirmDialogModel {
    title: string
    message: string
}

export class ConfirmDialog implements IDialogCustomElementViewModel {
    private readonly controller = resolve(IDialogController)

    title = ''
    message = ''

    activate(model: ConfirmDialogModel): void {
        this.title = model.title
        this.message = model.message
    }

    ok(): void {
        void this.controller.ok()
    }

    cancel(): void {
        void this.controller.cancel()
    }
}
