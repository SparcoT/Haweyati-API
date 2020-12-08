import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service'
import { IDriverRequest } from '../../data/interfaces/driverRequest.interface'
import { IDriversInterface } from '../../data/interfaces/drivers.interface'
import { IVehicleType } from "../../data/interfaces/vehicleType.interface"
import { VehicleTypeService } from "../vehicle-type/vehicle-type.service"
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { IPerson } from '../../data/interfaces/person.interface'
import { LocationUtils } from '../../common/lib/location-utils'
import { SimpleService } from '../../common/lib/simple.service'
import { PersonsService } from '../persons/persons.service'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

@Injectable()
export class DriversService extends SimpleService<IDriversInterface> {
  constructor(
    @InjectModel('drivers')
    protected readonly model: Model<IDriversInterface>,
    @InjectModel('driverRequest')
    protected readonly requestModel: Model<IDriverRequest>,

    protected readonly vehicleTypeService: VehicleTypeService,
    protected readonly personsService: PersonsService,
    protected readonly adminNotificationsService: AdminNotificationsService
  ) {
    super(model)
  }

  async fetch(id?: string): Promise<IDriversInterface[] | IDriversInterface> {
    if (id) {
      const data = await this.model
        .findOne({ _id: id })
        .populate('profile')
        .exec()
      ;(data.profile as IPerson).password = ''
      data.vehicle.type = (await this.vehicleTypeService.fetch(data.vehicle.type.toString())) as IVehicleType
      return data
    } else {
      const all = await this.model
        .find()
        .populate('profile')
        .exec()

      for (const data of all) {
        ;(data.profile as IPerson).password = ''
        data.vehicle.type = (await this.vehicleTypeService.fetch(data.vehicle.type.toString())) as IVehicleType
      }
      return all
    }
  }

  async create(document: any): Promise<IDriversInterface> {
    const allDrivers = await this.model.find().exec()
    for (const driver of allDrivers) {
      if (document.identificationNo == driver.vehicle.identificationNo) {
        if (document._id != driver._id)
          throw new HttpException(
            'Vehicle with this Identification No already exists!',
            HttpStatus.NOT_ACCEPTABLE
          )
      }
      if (document.license == driver.license) {
        if (document._id != driver._id)
          throw new HttpException(
            'Driver with this license already exists!',
            HttpStatus.NOT_ACCEPTABLE
          )
      }
    }

    document.location = {
      latitude: document.latitude,
      longitude: document.longitude,
      address: await LocationUtils.getCity(document.latitude, document.longitude)
    }
    document.vehicle = {
      name: document.vehicleName,
      model: document.model,
      identificationNo: document.identificationNo,
      type: document.type
    }
    document.scope = 'driver'
    let person: any
    let driver: any

    if (document.profile) {
      await this.personsService.addScope(document.profile, document.scope)
      driver = await super.create(document)
    } else {
      const personObject = {
        scope: document.scope,
        contact: document.contact,
        email: document.email,
        password: document.password,
        image: document.image,
        name: document.name,
        username: document.contact
      }

      person = await this.personsService.create(personObject)
      if (person) {
        document.profile = person

        document.city = await LocationUtils.getCity(document.latitude, document.longitude)
        driver = await super.create(document)
      }
    }

    if (driver) {
      await this.requestModel.create({
        driver: driver._id,
        status: driver.status,
        message: ''
      })
      const notification = {
        type: 'Driver',
        title: 'New Driver',
        message:
          'New Driver SignUp with name : ' +
          ((
            await this.model
              .findOne({ profile: driver.profile })
              .populate('profile')
              .exec()
          ).profile as IPerson).name +
          '.'
      }
      await this.adminNotificationsService.create(notification)
    } else {
      await this.personsService.delete(person)
      throw new HttpException(
        'Unable to sign up, Please contact admin support!',
        HttpStatus.NOT_ACCEPTABLE
      )
    }

    driver.vehicle.type = await this.vehicleTypeService.fetch(driver.vehicle.type)
    return driver
  }

  async change(document: any): Promise<IDriversInterface> {
    const allDrivers = await this.model
      .find({ status: { $nin: ['Rejected'] } })
      .exec()

    for (const driver of allDrivers) {
      if (document.identificationNo == driver.vehicle.identificationNo) {
        if (document._id != driver._id)
          throw new HttpException(
            'Vehicle with this Identification No already exists!',
            HttpStatus.NOT_ACCEPTABLE
          )
      }
      else if (document.license == driver.license) {
        if (document._id != driver._id)
          throw new HttpException(
            'Driver with this license already exists!',
            HttpStatus.NOT_ACCEPTABLE
          )
      }

    }

    let personObject = undefined

    if (document.image) {
      personObject = {
        _id: document.profile,
        image: document.image,
        name: document.name,
        email: document.email
      }
    } else {
      personObject = {
        _id: document.profile,
        name: document.name,
        email: document.email
      }
    }
    document.profile = await this.personsService.change(personObject)
    const person = document.profile
    if (person) {
      if (document.latitude){
        document.city = await LocationUtils.getCity(
          document.latitude,
          document.longitude
        )
        document.location = {
          latitude: document.latitude,
          longitude: document.longitude,
          address: await LocationUtils.getAddress(
            document.latitude,
            document.longitude
          )
        }
      }
      if (
        document.isVehicleInfoChanged == true || document.isVehicleInfoChanged == 'true'
      ) {
        document.vehicle = {
          name: document.vehicleName,
          model: document.model,
          identificationNo: document.identificationNo,
          type: document.type
        }
        if (!document.isAdmin)
          document.status = 'Pending'
      }
    }
    let driver = await this.model.findByIdAndUpdate(document._id, document).exec()

    if (driver) {
      if (!(await this.requestModel.findOne({ driver: driver._id }).exec())) {
        // @ts-ignore
        await this.requestModel.create({
          driver: driver._id,
          status: driver.status
        })
      }

      if (!document.isAdmin){
        const notification = {
          type: 'Driver',
          title: 'Driver Updated',
          message: 'Driver Updated with name : ' + document.name + '.'
        }
        await this.adminNotificationsService.create(notification)
      }
    }

    driver = await this.model.findById(driver._id).populate('profile').exec()
    driver.vehicle.type = (await this.vehicleTypeService.fetch(driver.vehicle.type.toString())) as IVehicleType
    return driver
  }

  async getByStatus(status: string): Promise<IDriversInterface[]> {
    return await this.model
      .find({ status })
      .populate('profile')
      .exec()
  }

  async updateByStatus(id: string, status: string): Promise<any> {
    const request = await this.requestModel.findById(id).exec()
    if (request && status == 'Active') {
      await this.model.findByIdAndUpdate(request.driver._id, { status }).exec()
      await this.requestModel.findByIdAndDelete(id)
      return { message: 'Status Changed Successfully!' }
    } else {
      await this.model.findByIdAndUpdate(id, { status }).exec()
      return { message: 'Status Changed Successfully!' }
    }
  }

  async getRejected(id: string, data?: any): Promise<any> {
    // @ts-ignore
    const request = await this.requestModel.findOne({ driver: id }).exec()
    await this.model
      .findByIdAndUpdate(request.driver, { status: 'Rejected' })
      .exec()
    await this.requestModel.findOneAndUpdate(
      // @ts-ignore
      { driver: id },
      { status: 'Rejected' }
    )
    return {
      message: 'Request Rejected'
    }
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
