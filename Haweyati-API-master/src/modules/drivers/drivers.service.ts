import { Injectable } from '@nestjs/common'
import { SimpleService } from '../../common/lib/simple.service'
import { IDriversInterface } from '../../data/interfaces/drivers.interface'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { IDriverRequest } from '../../data/interfaces/driverRequest.interface'
import { IRejectedDrivers } from '../../data/interfaces/rejectedDrivers.interface'
import { PersonsService } from '../persons/persons.service'

@Injectable()
export class DriversService extends SimpleService<IDriversInterface> {
  constructor(
    @InjectModel('drivers')
    protected readonly model: Model<IDriversInterface>,
    @InjectModel('driverRequest')
    protected readonly requestModel: Model<IDriverRequest>,
    @InjectModel('driverRejection')
    protected readonly rejectedModel: Model<IRejectedDrivers>,
    protected readonly personsService: PersonsService
  ) {
    super(model)
  }

  async fetch(id?: string): Promise<IDriversInterface[] | IDriversInterface> {
    if (id) {
      const data = await this.model
        .findOne({ _id: id, supplier: null })
        .populate('profile')
        .exec()
      // @ts-ignore
      data.profile.password = ''
      return data
    } else {
      const all = await this.model
        .find({ supplier: null })
        .populate('profile')
        .exec()
      for (let data of all) {
        // @ts-ignore
        data.profile.password = ''
      }
      return all
    }
  }

  async create(document: any): Promise<IDriversInterface> {
    console.log(document)
    document._id = undefined
    const data = await this.model.create(document)
    await this.requestModel.create({
      driver: data._id,
      status: data.status
    })
    return data
  }

  async getRequests(): Promise<IDriverRequest[]> {
    // eslint-disable-next-line prefer-const
    let requests = await this.requestModel.find({ status: 'Pending' }).exec()

    for (let i = 0; i < requests.length; i++) {
      requests[i].driver = (await this.fetch(
        requests[i].driver.toString()
      )) as IDriversInterface
    }

    return requests
  }

  async getVerified(id?: string): Promise<any> {
    if (id) {
      const request = await this.requestModel.findById(id).exec()
      await this.model
        .findByIdAndUpdate(request.driver._id, { status: 'Approved' })
        .exec()
      await this.requestModel.findByIdAndDelete(id)
      return {
        message: 'Request Approved'
      }
    } else {
      return await this.model
        .find({ status: 'Approved', supplier: null })
        .populate('profile')
        .exec()
    }
  }

  async getRejected(id?: string, data?: any): Promise<any> {
    if (id) {
      const request = await this.requestModel.findById(id).exec()
      if (data != null) {
        this.rejectedModel.create({
          request: id,
          message: data.message,
          createdAt: Date.now()
        })
      }
      await this.model
        .findByIdAndUpdate(request.driver._id, { status: 'Rejected' })
        .exec()
      await this.requestModel.findByIdAndUpdate(id, { status: 'Rejected' })
      return {
        message: 'Request Rejected'
      }
    } else {
      return await this.model
        .find({ status: 'Rejected', supplier: null })
        .populate('profile')
        .exec()
    }
  }

  async getBlocked(id?: string): Promise<any> {
    if (id) {
      return await this.model
        .findByIdAndUpdate(id, { status: 'Blocked' })
        .exec()
    } else {
      return await this.model
        .find({ status: 'Blocked', supplier: null })
        .populate('profile')
        .exec()
    }
  }

  async getUnblocked(id: string): Promise<any> {
    return await this.model.findByIdAndUpdate(id, { status: 'Approved' }).exec()
  }

  async getCompanyDrivers(id: string): Promise<IDriversInterface[]> {
    return await this.model
      .find()
      .where('supplier', id)
      .populate('profile')
      .exec()
  }

  async getByPersonId(id: string) {
    return await this.model
      .findOne({ profile: id })
      .populate('profile')
      .exec()
  }
}
