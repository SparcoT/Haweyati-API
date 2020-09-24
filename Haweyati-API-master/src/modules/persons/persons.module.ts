import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PersonsService } from './persons.service'
import { MulterModule } from '@nestjs/platform-express'
import { PersonsController } from './persons.controller'
import { PersonsSchema } from 'src/data/schemas/persons.schema'
import { AdminForgotPasswordSchema } from '../../data/schemas/adminForgotPassword.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: 'persons',
        schema: PersonsSchema
      },
      {
        name: 'forgotpassword',
        schema: AdminForgotPasswordSchema
      }
    ]),
    MulterModule.register({
      dest: '../uploads'
    })
  ],
  controllers: [PersonsController],
  providers: [PersonsService],
  exports: [PersonsService]
})
export class PersonsModule {}
